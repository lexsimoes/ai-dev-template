// Revisor automático de PRs, independente de provedor.
//
// Modos:
//   --mode ci      no GitHub Actions: decide o tipo de revisão pelo evento, comenta e falha se houver bloqueante
//   --mode local   na sua máquina: revisão completa da branch atual contra origin/main, impressa no terminal
//   --mode canary  mede o revisor contra um PR fictício com defeitos plantados (scripts/review/canary/)
// Opções: --dry-run (mostra o que seria enviado, sem chamar o modelo) · --base <ref> · --tier <nível>
//
// No CI, o tipo de revisão depende do evento:
//   PR marcado como pronto / aberto pronto / reaberto → completa (ou incremental, se já houve revisão)
//   rótulo "revisar-de-novo"                         → incremental desde o último commit revisado
//   rótulo "revisão-profunda"                        → completa, com o modelo mais forte
//   push depois da revisão                           → sem chamada ao modelo: mantém o veredito anterior,
//                                                      mas falha se os commits novos tiverem segredo,
//                                                      caminho sensível ou se houver bloqueante pendente
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
  composeComment,
  decideKind,
  decodeState,
  deletedFiles,
  extractReport,
  filterFiles,
  isDispensed,
  openFindings,
  parseRenames,
  parseReview,
  pushReasons,
  redactSecrets,
  renderReport,
  resolvePrevious,
  retargetRenamed,
  secretFinding,
  secretPathFindings,
  selectTier,
  splitDiff,
} from "./lib.ts";
import type {
  Finding,
  ParsedReview,
  PreviousFinding,
  ReportInput,
  ReviewConfig,
  ReviewKind,
  ReviewState,
  Severity,
  TierName,
  Usage,
} from "./lib.ts";
import { ModelCallError, callModel } from "./providers.ts";

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// O GitHub Actions define GITHUB_API_URL (também aponta para GitHub Enterprise).
const API = process.env.GITHUB_API_URL || "https://api.github.com";
const CANARY_DIR = join(SOURCE_DIR, "scripts", "review", "canary");

interface CanaryDefect {
  id: string;
  descricao: string;
  arquivo: string;
  linhas: [number, number] | null;
  severidadeMinima: Severity;
}

interface ExistingComment {
  id: number;
  body: string;
}

function readSource(path: string): string {
  return readFileSync(join(SOURCE_DIR, path), "utf-8");
}

function loadConfig(): ReviewConfig {
  const config = JSON.parse(readSource(".github/review.json")) as ReviewConfig;
  // As variáveis do repositório trocam o provedor do nível padrão e do leve (que é o padrão com menos raciocínio).
  for (const name of ["padrao", "leve"] as const) {
    if (process.env.REVIEW_API_BASE_URL) config.tiers[name].baseUrl = process.env.REVIEW_API_BASE_URL;
    if (process.env.REVIEW_MODEL) config.tiers[name].model = process.env.REVIEW_MODEL;
  }
  return config;
}

// core.quotePath=false: nomes com acento saem como estão (sem aspas nem códigos octais).
function git(...args: string[]): string {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

/**
 * O commit revisado ainda está no histórico do PR? "Não é ancestral" (saída 1) e "commit inexistente"
 * (force-push que o apagou) dão false; qualquer outro erro do git é erro de verdade, não "force-push".
 */
function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], { stdio: ["ignore", "ignore", "pipe"] });
    return true;
  } catch (e) {
    const err = e as { status?: number; stderr?: Buffer | string };
    const stderr = String(err.stderr ?? "");
    if (err.status === 1 || /not a valid commit|bad object|unknown revision/i.test(stderr)) return false;
    throw new Error(`git merge-base falhou (${err.status ?? "?"}): ${stderr.trim().slice(0, 300)}`, { cause: e });
  }
}

// ---------- GitHub ----------

function githubEnv() {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: pr } = process.env;
  if (!token || !repo || !pr) throw new Error("faltam GITHUB_TOKEN, GITHUB_REPOSITORY ou PR_NUMBER");
  return { repo, pr, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } };
}

async function findComment(): Promise<ExistingComment | null> {
  const { repo, pr, headers } = githubEnv();
  // Pagina: em PRs com muitos comentários, o do revisor pode não estar na primeira página.
  for (let page = 1; page <= 20; page++) {
    const list = await fetch(`${API}/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`, { headers });
    if (!list.ok) throw new Error(`não consegui listar comentários (HTTP ${list.status})`);
    const comments = (await list.json()) as Array<{ id: number; body?: string; user?: { login?: string } }>;
    // Só vale o comentário do próprio robô do GitHub Actions.
    const mine = comments.find((c) => c.user?.login === "github-actions[bot]" && c.body?.includes(REPORT_MARKER));
    if (mine) return { id: mine.id, body: mine.body ?? "" };
    if (comments.length < 100) return null;
  }
  return null;
}

async function upsertComment(existing: ExistingComment | null, body: string): Promise<void> {
  const { repo, pr, headers } = githubEnv();
  const url = existing
    ? `${API}/repos/${repo}/issues/comments/${existing.id}`
    : `${API}/repos/${repo}/issues/${pr}/comments`;
  const response = await fetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(`não consegui publicar o comentário (HTTP ${response.status})`);
}

/** Tira o rótulo "revisar-de-novo" depois de usá-lo, para poder ser aplicado de novo. */
async function removeLabel(label: string): Promise<void> {
  const { repo, pr, headers } = githubEnv();
  const response = await fetch(`${API}/repos/${repo}/issues/${pr}/labels/${encodeURIComponent(label)}`, {
    method: "DELETE",
    headers,
  });
  if (!response.ok && response.status !== 404) console.warn(`Aviso: não consegui remover o rótulo ${label} (HTTP ${response.status}).`);
}

// ---------- canário ----------

/** Canário incremental: o achado NÃO corrigido não pode virar "resolvido"; o corrigido deve. */
function evaluateIncrementalCanary(resolved: Array<{ id: number; status: string; titulo: string; comentario: string }>): {
  text: string;
  passed: boolean;
} {
  const expected = JSON.parse(readFileSync(join(CANARY_DIR, "incremental", "expected.json"), "utf-8")) as {
    resolvido: number[];
    pendente: number[];
  };
  const rows = resolved.map((r) => {
    const want = expected.resolvido.includes(r.id) ? "resolvido" : expected.pendente.includes(r.id) ? "pendente" : "?";
    return { r, want, ok: r.status === want };
  });
  const passed = rows.every((x) => x.ok) && rows.length === expected.resolvido.length + expected.pendente.length;
  const lines = [
    `## 🐤 Canário incremental: ${rows.filter((x) => x.ok).length} de ${rows.length} vereditos corretos`,
    "",
    "| Achado anterior | Esperado | Veredito do modelo |",
    "|---|---|---|",
    ...rows.map(({ r, want, ok }) => `| ${r.id}. ${r.titulo} | ${want} | ${ok ? "✅" : "❌"} ${r.status}: ${r.comentario} |`),
  ];
  return { text: lines.join("\n"), passed };
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

// ---------- execução ----------

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      mode: { type: "string", default: "local" },
      "dry-run": { type: "boolean", default: false },
      base: { type: "string" },
      tier: { type: "string" },
      canary: { type: "string", default: "completa" },
    },
  });
  const mode = values.mode ?? "local";
  if (!["ci", "local", "canary"].includes(mode)) throw new Error(`modo desconhecido: ${mode}`);

  const started = Date.now();
  const config = loadConfig();
  const notes: string[] = [];

  // Contexto do PR
  const baseRef = mode === "ci" ? `origin/${process.env.BASE_REF || "main"}` : (values.base ?? "origin/main");
  const headSha = mode === "ci" ? (process.env.HEAD_SHA || git("rev-parse", "HEAD").trim()) : "HEAD";
  let labels = (JSON.parse(process.env.PR_LABELS || "[]") as string[] | null) ?? [];
  let title = process.env.PR_TITLE ?? "";
  let body = process.env.PR_BODY ?? "";
  if (mode === "local") title = git("log", "-1", "--format=%s").trim();

  const canaryCase = values.canary ?? "completa";
  if (mode === "canary" && !["completa", "leve", "incremental"].includes(canaryCase)) throw new Error(`caso de canário desconhecido: ${canaryCase}`);
  const incrementalCanary = mode === "canary" && canaryCase === "incremental";

  const existing = mode === "ci" && !values["dry-run"] ? await findComment() : null;
  // Canário incremental: estado fictício com os achados "anteriores" do caso.
  const state: ReviewState | null = incrementalCanary
    ? { sha: "0".repeat(40), achados: JSON.parse(readFileSync(join(CANARY_DIR, "incremental", "anteriores.json"), "utf-8")) as Finding[] }
    : existing
      ? decodeState(existing.body)
      : null;
  if (existing && !state && existing.body.includes("revisor-estado")) notes.push("O estado guardado no comentário era inválido e foi ignorado.");
  const stateReachable = mode === "ci" && state !== null && isAncestor(state.sha, headSha);
  const event = { action: process.env.EVENT_ACTION ?? "", label: process.env.EVENT_LABEL ?? "", labels };
  const decision =
    mode === "ci"
      ? decideKind(event, config, state, stateReachable)
      : { kind: (incrementalCanary ? "incremental" : "completa") as ReviewKind, note: null };
  const kind = decision.kind;
  if (decision.note) notes.push(decision.note);

  // Diff a analisar: o PR inteiro, ou só o que mudou desde a última revisão.
  // Os detectores de segredo sempre olham o PR inteiro: um segredo só some quando sai do PR.
  let diff: string;
  let fullDiff: string;
  let prPaths: string[];
  if (mode === "canary") {
    const pr = JSON.parse(readFileSync(join(CANARY_DIR, "pr.json"), "utf-8")) as { title: string; body: string; labels?: string[] };
    title = pr.title;
    body = pr.body;
    labels = pr.labels ?? [];
    // O segredo falso é gerado na hora: nenhum valor parecido com chave fica gravado no repositório.
    const fake = ["canario", "nao", "e", "real", Date.now().toString(36), "x".repeat(12)].join("-");
    diff = incrementalCanary
      ? readFileSync(join(CANARY_DIR, "incremental", "incremental.diff"), "utf-8")
      : readFileSync(join(CANARY_DIR, "canary.diff"), "utf-8").replaceAll("{{SEGREDO_FALSO}}", fake);
    fullDiff = diff;
    prPaths = splitDiff(diff).map((f) => f.path);
  } else {
    prPaths = git("diff", "--name-only", "-z", `${baseRef}...${headSha}`).split("\0").filter(Boolean);
    fullDiff = git("diff", "--no-color", "-U5", `${baseRef}...${headSha}`);
    const incrementalBase = (kind === "incremental" || kind === "sem-revisao") && state && stateReachable ? state.sha : null;
    diff = incrementalBase ? git("diff", "--no-color", "-U5", incrementalBase, headSha) : fullDiff;
  }

  // Só arquivos do PR: um merge da main na branch não infla o diff incremental.
  const prPathSet = new Set(prPaths);
  const allFiles = splitDiff(diff).filter((f) => prPathSet.has(f.path) || mode === "canary");
  const filtered = filterFiles(allFiles, config);
  const redacted = filtered.included.map(redactSecrets);
  const included = redacted.map((r) => r.file);
  const fullFiles = splitDiff(fullDiff);
  const fullFiltered = filterFiles(fullFiles, config);
  const fullHits = fullFiltered.included.flatMap((f) => redactSecrets(f).hits);
  const secretFindings = [
    ...secretPathFindings(fullFiles, fullFiltered.excluded),
    ...fullHits.filter((h) => h.added).map((h) => secretFinding(h.path, h.line)),
  ];
  const contextHits = redacted.flatMap((r) => r.hits).filter((h) => !h.added).length;
  if (contextHits > 0) notes.push(`${contextHits} possível(is) segredo(s) em linhas já existentes foram redigidos antes do envio.`);

  // ----- push depois da revisão: nenhuma chamada ao modelo -----
  if (kind === "sem-revisao") {
    const changed = allFiles.map((f) => f.path);
    const reasons = pushReasons({ state, stateReachable, secretFindings, changedPaths: changed, config });
    const since = state ? ` desde \`${state.sha.slice(0, 7)}\`` : "";
    const banner = [
      `> ⏩ **Commits novos${since} não foram revisados pelo modelo** (push depois da revisão: \`${headSha.slice(0, 7)}\`).`,
      changed.length ? `> Arquivos alterados: ${changed.map((p) => `\`${p}\``).join(", ")}` : "",
      reasons.length
        ? `> ❌ Check vermelho: ${reasons.join("; ")}. Corrija se for o caso e aplique o rótulo \`${config.rereviewLabel}\` para uma nova revisão.`
        : `> ✅ Check verde: veredito anterior mantido. **O verde não cobre estes commits**: para revisá-los, aplique o rótulo \`${config.rereviewLabel}\`.`,
    ]
      .filter(Boolean)
      .join("\n");
    // Nada mudou desde a revisão (ex.: um rótulo alheio): o veredito é recalculado e o comentário fica como está.
    if (state && changed.length === 0) {
      const verdict = reasons.length ? `❌ Check vermelho: ${reasons.join("; ")}.` : "✅ Veredito da última revisão mantido.";
      console.log(verdict);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, verdict + "\n");
      return reasons.length ? 1 : 0;
    }
    const comment = composeComment(banner, existing ? extractReport(existing.body) : "", state);
    console.log(comment);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, banner + "\n");
    if (mode === "ci" && !values["dry-run"]) await upsertComment(existing, comment);
    return reasons.length ? 1 : 0;
  }

  // ----- nível -----
  const selected = values.tier
    ? { tier: values.tier as TierName, reason: "nível escolhido por --tier" }
    : mode === "canary"
      ? canaryCase === "leve"
        ? { tier: "leve" as TierName, reason: "canário do nível leve" }
        : { tier: "padrao" as TierName, reason: `canário (${canaryCase}) mede o nível padrão` }
      : selectTier(prPaths, labels, config);
  let tierName = selected.tier;
  let tier = config.tiers[tierName];
  if (!tier) throw new Error(`nível desconhecido: ${tierName}`);
  if ((tierName === "sensivel" || tierName === "profunda") && !process.env[tier.apiKeyEnv]) {
    notes.push(
      `Escalonamento para \`${tier.model}\` (${selected.reason}) **não executado**: o segredo \`${tier.apiKeyEnv}\` não está configurado. Revisado pelo nível padrão.`,
    );
    tierName = "padrao";
    tier = config.tiers.padrao;
  }
  const dispensed = mode === "ci" && isDispensed(kind, tierName, config);
  const finalKind: ReviewKind = dispensed ? "dispensada" : kind;

  // ----- achados anteriores (revisão incremental) -----
  // Achados de detector não entram: o detector roda de novo no PR inteiro e os reporta enquanto existirem.
  // Arquivo renomeado desde a última revisão: o achado passa para o caminho novo (renomear não fecha achado).
  const renames =
    finalKind === "incremental" && state && mode !== "canary"
      ? parseRenames(git("diff", "--name-status", "-z", "-M", state.sha, headSha))
      : {};
  const previous: PreviousFinding[] =
    finalKind === "incremental"
      ? retargetRenamed((state?.achados ?? []).filter((a) => a.origem !== "detector"), renames).map((a, i) => ({ ...a, id: i + 1 }))
      : [];
  const changedNow = new Set(included.map((f) => f.path));
  const toCheck = previous.filter((p) => p.arquivo === "PR" || changedNow.has(p.arquivo));

  const diffText = included.map((f) => f.text).join("\n");
  const prompt = buildPrompt({
    reviewMd: readSource("REVIEW.md"),
    agentsMd: readSource("AGENTS.md"),
    title,
    body,
    labels,
    diff: diffText,
    files: included.map((f) => f.path),
    withheld: [...filtered.excluded, ...filtered.ignored],
    maxFindings: config.maxFindings,
    ...(finalKind === "incremental" && state ? { incremental: { sinceSha: state.sha, previous: toCheck } } : {}),
  });

  if (values["dry-run"]) {
    console.log(
      [
        `Modo: ${mode} (dry-run, nenhuma chamada ao modelo) · tipo: ${finalKind}`,
        `Nível: ${tierName} (${selected.reason}) · modelo: ${tier.model}`,
        ...notes.map((n) => `Nota: ${n}`),
        `Arquivos enviados (${included.length}): ${included.map((f) => f.path).join(", ") || "nenhum"}`,
        `Nunca enviados (segredo): ${filtered.excluded.join(", ") || "nenhum"}`,
        `Ignorados (configuração): ${filtered.ignored.join(", ") || "nenhum"}`,
        `Possíveis segredos em linhas adicionadas: ${secretFindings.length}`,
        `Tamanho do diff: ${diffText.length} de ${config.maxDiffChars} caracteres permitidos`,
        `Prompt: ${prompt.system.length} caracteres de sistema (fixos, aproveitam cache) + ${prompt.user.length} do PR`,
      ].join("\n"),
    );
    return 0;
  }

  // ----- chamada ao modelo -----
  let review: ParsedReview | null = null;
  let usage: Usage | null = null;
  let error: string | null = null;
  const apiKey = process.env[tier.apiKeyEnv];
  const needsModel = finalKind !== "dispensada" && (included.length > 0 || toCheck.length > 0);
  if (finalKind === "dispensada") {
    notes.push('PR trivial com `trivial.mode = "nenhuma"`: só os detectores de segredo rodaram.');
  } else if (!needsModel) {
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
      if (e instanceof ModelCallError) usage = e.usage;
    }
  }

  const checkedIds = new Set(toCheck.map((p) => p.id));
  const resolved = resolvePrevious(previous, (review?.anteriores ?? []).filter((s) => checkedIds.has(s.id)), {
    deletedPaths: deletedFiles(splitDiff(diff)),
    prPaths: mode === "canary" ? undefined : prPaths,
    changedPaths: [...changedNow],
  });
  const report: ReportInput = {
    kind: finalKind,
    reviewedSha: mode === "ci" ? headSha : null,
    sinceSha: finalKind === "incremental" ? (state?.sha ?? null) : null,
    tierName,
    tier: needsModel ? tier : null,
    reason: selected.reason,
    notes,
    review,
    previous: resolved,
    secretFindings,
    excluded: filtered.excluded,
    ignored: filtered.ignored,
    usage,
    durationMs: Date.now() - started,
    error,
  };
  let markdown = renderReport(report);
  const open = openFindings(report);
  const blocking = open.filter((f) => f.severidade === "bloqueante").length;

  let exitCode = error || blocking > 0 ? 1 : 0;
  if (incrementalCanary) {
    const canary = evaluateIncrementalCanary(resolved);
    markdown = `${canary.text}\n\n${markdown}`;
    exitCode = error || !canary.passed ? 1 : 0;
  } else if (mode === "canary") {
    const canary = evaluateCanary([...secretFindings, ...(review?.achados ?? [])]);
    markdown = `${canary.text}\n\n${markdown}`;
    exitCode = error || !canary.passed ? 1 : 0;
  }

  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n");
  if (mode === "ci") {
    // Só avança o estado quando a revisão terminou. Em erro, o estado anterior continua valendo,
    // mas marcado com a falha: o próximo push não fica verde até uma revisão terminar bem.
    const newState: ReviewState | null = error ? (state ? { ...state, falha: headSha } : null) : { sha: headSha, achados: open };
    const banner = `> Pushes novos não disparam outra revisão. Para revisar de novo (só o que mudou), aplique o rótulo \`${config.rereviewLabel}\`.`;
    await upsertComment(existing, composeComment(banner, markdown, newState));
    if (labels.includes(config.rereviewLabel)) await removeLabel(config.rereviewLabel);
  }
  return exitCode;
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(`Revisor: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  },
);
