// Revisor automático de PRs, independente de provedor.
//
// Modos:
//   --mode ci      no GitHub Actions: revisa o PR, comenta o relatório e falha se houver bloqueante
//   --mode local   na sua máquina: revisa a branch atual contra origin/main e imprime o relatório
//   --mode canary  mede o revisor contra um PR fictício com defeitos plantados (scripts/review/canary/)
// Opções: --dry-run (mostra o que seria enviado, sem chamar o modelo) · --base <ref> · --tier <nível>
//
// Critérios (REVIEW.md), regras (AGENTS.md) e configuração (.github/review.json) são lidos da pasta
// onde este script está. No CI ela é a branch de destino: um PR não afrouxa a própria revisão.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  REPORT_MARKER,
  buildPrompt,
  filterFiles,
  parseReview,
  redactSecrets,
  renderReport,
  selectTier,
  splitDiff,
} from "./lib.ts";
import type { Finding, ParsedReview, ReportInput, ReviewConfig, Severity, TierName, Usage } from "./lib.ts";
import { callModel } from "./providers.ts";

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANARY_DIR = join(SOURCE_DIR, "scripts", "review", "canary");

interface PrContext {
  diff: string;
  title: string;
  body: string;
  labels: string[];
}

interface CanaryDefect {
  id: string;
  descricao: string;
  arquivo: string;
  linhas: [number, number] | null;
  severidadeMinima: Severity;
}

function readSource(path: string): string {
  return readFileSync(join(SOURCE_DIR, path), "utf-8");
}

function loadConfig(): ReviewConfig {
  const config = JSON.parse(readSource(".github/review.json")) as ReviewConfig;
  if (process.env.REVIEW_API_BASE_URL) config.tiers.padrao.baseUrl = process.env.REVIEW_API_BASE_URL;
  if (process.env.REVIEW_MODEL) config.tiers.padrao.model = process.env.REVIEW_MODEL;
  return config;
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

function loadContext(mode: string, base: string | undefined): PrContext {
  if (mode === "canary") {
    const pr = JSON.parse(readFileSync(join(CANARY_DIR, "pr.json"), "utf-8")) as Omit<PrContext, "diff">;
    // O segredo falso é gerado na hora: nenhum valor parecido com chave fica gravado no repositório.
    const fake = ["canario", "nao", "e", "real", Date.now().toString(36), "x".repeat(12)].join("-");
    const diff = readFileSync(join(CANARY_DIR, "canary.diff"), "utf-8").replaceAll("{{SEGREDO_FALSO}}", fake);
    return { ...pr, diff };
  }
  const baseRef = mode === "ci" ? `origin/${process.env.BASE_REF || "main"}` : (base ?? "origin/main");
  const labels = JSON.parse(process.env.PR_LABELS || "[]") as string[] | null;
  return {
    diff: git("diff", "--no-color", "-U5", `${baseRef}...HEAD`),
    title: mode === "ci" ? (process.env.PR_TITLE ?? "") : git("log", "-1", "--format=%s").trim(),
    body: mode === "ci" ? (process.env.PR_BODY ?? "") : "",
    labels: labels ?? [],
  };
}

function secretFinding(path: string, line: number | null): Finding {
  return {
    severidade: "bloqueante",
    arquivo: path,
    linha: line,
    titulo: "Possível segredo no código",
    explicacao:
      "Uma linha adicionada parece conter uma chave, token ou senha. Remova do código, troque a chave no provedor (considere-a vazada) e use variáveis de ambiente ou os Secrets do GitHub.",
    evidencia: "[REDIGIDO]: o valor não é mostrado aqui nem foi enviado ao modelo",
  };
}

async function upsertComment(body: string): Promise<void> {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: pr } = process.env;
  if (!token || !repo || !pr) throw new Error("faltam GITHUB_TOKEN, GITHUB_REPOSITORY ou PR_NUMBER para comentar no PR");
  const headers = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  const list = await fetch(`https://api.github.com/repos/${repo}/issues/${pr}/comments?per_page=100`, { headers });
  if (!list.ok) throw new Error(`não consegui listar comentários (HTTP ${list.status})`);
  const existing = ((await list.json()) as Array<{ id: number; body?: string }>).find((c) => c.body?.includes(REPORT_MARKER));
  const url = existing
    ? `https://api.github.com/repos/${repo}/issues/comments/${existing.id}`
    : `https://api.github.com/repos/${repo}/issues/${pr}/comments`;
  const response = await fetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(`não consegui publicar o comentário (HTTP ${response.status})`);
}

function evaluateCanary(findings: Finding[]): { text: string; passed: boolean } {
  const expected = JSON.parse(readFileSync(join(CANARY_DIR, "expected.json"), "utf-8")) as CanaryDefect[];
  const rank: Record<Severity, number> = { bloqueante: 0, importante: 1, sugestao: 2 };
  const rows = expected.map((d) => {
    const hit = findings.find(
      (f) =>
        f.arquivo === d.arquivo &&
        rank[f.severidade] <= rank[d.severidadeMinima] &&
        (d.linhas === null || f.linha === null || (f.linha >= d.linhas[0] - 3 && f.linha <= d.linhas[1] + 3)),
    );
    return { d, hit };
  });
  const found = rows.filter((r) => r.hit).length;
  const lines = [
    `## 🐤 Canário do revisor: ${found} de ${expected.length} defeitos plantados encontrados`,
    "",
    "| Defeito plantado | Esperado | Resultado |",
    "|---|---|---|",
    ...rows.map(
      ({ d, hit }) =>
        `| ${d.descricao} (\`${d.arquivo}\`) | ${d.severidadeMinima} ou pior | ${hit ? `✅ ${hit.severidade}: ${hit.titulo}` : "❌ não encontrado"} |`,
    ),
  ];
  return { text: lines.join("\n"), passed: found === expected.length };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", default: "local" },
      "dry-run": { type: "boolean", default: false },
      base: { type: "string" },
      tier: { type: "string" },
    },
  });
  const mode = values.mode ?? "local";
  if (!["ci", "local", "canary"].includes(mode)) throw new Error(`modo desconhecido: ${mode}`);

  const started = Date.now();
  const config = loadConfig();
  const context = loadContext(mode, values.base);
  const allFiles = splitDiff(context.diff);
  const filtered = filterFiles(allFiles, config);

  const redacted = filtered.included.map(redactSecrets);
  const included = redacted.map((r) => r.file);
  const hits = redacted.flatMap((r) => r.hits);
  const secretFindings = hits.filter((h) => h.added).map((h) => secretFinding(h.path, h.line));
  const notes: string[] = [];
  const contextHits = hits.filter((h) => !h.added).length;
  if (contextHits > 0) notes.push(`${contextHits} possível(is) segredo(s) em linhas já existentes foram redigidos antes do envio.`);

  const selected = values.tier
    ? { tier: values.tier as TierName, reason: "nível escolhido por --tier" }
    : mode === "canary"
      ? { tier: "padrao" as TierName, reason: "canário mede o nível padrão" }
      : selectTier(allFiles.map((f) => f.path), context.labels, config);
  let tierName = selected.tier;
  let tier = config.tiers[tierName];
  if (!tier) throw new Error(`nível desconhecido: ${tierName}`);
  if (tierName !== "padrao" && !process.env[tier.apiKeyEnv]) {
    notes.push(
      `Escalonamento para \`${tier.model}\` (${selected.reason}) **não executado**: o segredo \`${tier.apiKeyEnv}\` não está configurado. Revisado pelo nível padrão.`,
    );
    tierName = "padrao";
    tier = config.tiers.padrao;
  }

  const diffText = included.map((f) => f.text).join("\n");
  const prompt = buildPrompt({
    reviewMd: readSource("REVIEW.md"),
    agentsMd: readSource("AGENTS.md"),
    title: context.title,
    body: context.body,
    labels: context.labels,
    diff: diffText,
    files: included.map((f) => f.path),
    maxFindings: config.maxFindings,
  });

  if (values["dry-run"]) {
    console.log(
      [
        `Modo: ${mode} (dry-run, nenhuma chamada ao modelo)`,
        `Nível: ${tierName} (${selected.reason}) · modelo: ${tier.model}`,
        ...notes.map((n) => `Nota: ${n}`),
        `Arquivos enviados (${included.length}): ${included.map((f) => f.path).join(", ") || "nenhum"}`,
        `Nunca enviados (segredo): ${filtered.excluded.join(", ") || "nenhum"}`,
        `Ignorados (configuração): ${filtered.ignored.join(", ") || "nenhum"}`,
        `Possíveis segredos em linhas adicionadas: ${secretFindings.length}`,
        `Tamanho do diff: ${diffText.length} de ${config.maxDiffChars} caracteres permitidos`,
        `Tamanho do prompt: ${prompt.system.length + prompt.user.length} caracteres`,
      ].join("\n"),
    );
    return 0;
  }

  let review: ParsedReview | null = null;
  let usage: Usage | null = null;
  let error: string | null = null;
  const apiKey = process.env[tier.apiKeyEnv];
  if (included.length === 0) {
    notes.push("Nenhum arquivo revisável no diff.");
  } else if (diffText.length > config.maxDiffChars) {
    error = `o diff tem ${diffText.length} caracteres, acima do limite de ${config.maxDiffChars}. Divida o PR em partes menores.`;
  } else if (!apiKey) {
    error = `o segredo \`${tier.apiKeyEnv}\` não está disponível neste ambiente.`;
  } else {
    try {
      const reply = await callModel(tier, apiKey, prompt, config.timeoutMs);
      usage = reply.usage;
      review = parseReview(reply.text, included.map((f) => f.path), config.maxFindings);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  const report: ReportInput = {
    tierName,
    tier,
    reason: selected.reason,
    notes,
    review,
    secretFindings,
    excluded: filtered.excluded,
    ignored: filtered.ignored,
    usage,
    durationMs: Date.now() - started,
    error,
  };
  let markdown = renderReport(report);
  const blocking = [...secretFindings, ...(review?.achados ?? [])].filter((f) => f.severidade === "bloqueante").length;

  let exitCode = error || blocking > 0 ? 1 : 0;
  if (mode === "canary") {
    const canary = evaluateCanary([...secretFindings, ...(review?.achados ?? [])]);
    markdown = `${canary.text}\n\n${markdown}`;
    exitCode = error || !canary.passed ? 1 : 0;
  }

  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
  if (mode === "ci") await upsertComment(markdown);
  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`Revisor: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
