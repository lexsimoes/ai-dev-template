// Guarda dos invariantes, executada pelo job "invariantes" do CI.
// Falha quando:
//   1. um teste em tests/invariants/ é pulado ou isolado (.skip, .todo, .only, { skip: ... });
//   2. o PR altera tests/invariants/ sem o rótulo "invariante-aprovado" (dado pelo dono);
//   3. o número de testes de invariantes diminui sem esse rótulo;
//   4. no CI, o rótulo foi aplicado por alguém que não é dono de tests/invariants/ no CODEOWNERS
//      da branch de destino (ex.: um agente com identidade própria ou o robô do Actions).
//
// No CI roda a versão deste arquivo que está na branch de destino: um PR não afrouxa a própria guarda.
//
// Variáveis de ambiente (preenchidas pelo workflow):
//   EVENT_NAME  "pull_request" ou "push" (vazio = uso local, compara com a main)
//   BASE_REF    branch de destino do PR (ex.: "main")
//   PR_LABELS   JSON com os nomes dos rótulos do PR
//   PR_NUMBER, GITHUB_REPOSITORY, GITHUB_TOKEN  para conferir quem aplicou ou removeu o rótulo
//
// Uso local: npm run guard:invariants  (depois de git fetch origin main)

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const DIR = "tests/invariants";
const APPROVAL_LABEL = "invariante-aprovado";
const SKIP_PATTERN = /\b(?:test|it|describe|suite|t)\s*\.\s*(?:skip|todo|only)\b|\{\s*(?:skip|todo|only)\s*:/;
const TEST_CALL = /\b(?:test|it)\s*\(/g;

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf-8" });
}

function listTestFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf-8" })
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

function countTests(source: string): number {
  return source.match(TEST_CALL)?.length ?? 0;
}

export interface IssueEvent {
  event: string;
  label?: { name: string };
  actor?: { login: string } | null;
  created_at: string;
}

/** Donos de um caminho no CODEOWNERS: a última regra que casa vence, como no GitHub. Só entende `*`, pastas e arquivos exatos. */
export function ownersOf(codeowners: string, path: string): string[] {
  const target = path.replace(/^\//, "");
  let owners: string[] = [];
  for (const raw of codeowners.split("\n")) {
    const [pattern = "", ...rest] = raw.replace(/#.*/, "").trim().split(/\s+/);
    if (!pattern) continue;
    const prefix = pattern.replace(/^\//, "");
    // "/pasta" e "/pasta/" valem para a pasta inteira.
    const dir = prefix.endsWith("/") ? prefix : `${prefix}/`;
    if (pattern === "*" || target === prefix || target.startsWith(dir)) {
      // Só pessoas (@login); times (@org/time) não são conferidos aqui.
      owners = rest.filter((o) => o.startsWith("@") && !o.includes("/")).map((o) => o.slice(1).toLowerCase());
    }
  }
  return owners;
}

/** Quem aplicou o rótulo por último; null se ele nunca foi aplicado. */
export function lastLabeler(events: IssueEvent[], label: string): string | null {
  const applied = events.filter((e) => e.event === "labeled" && e.label?.name === label);
  if (applied.length === 0) return null;
  return applied.at(-1)?.actor?.login ?? "desconhecido";
}

/** O rótulo está aplicado agora, segundo o histórico (o payload de um "Re-run" pode estar velho). */
export function isLabeled(events: IssueEvent[], label: string): boolean {
  const last = events.filter((e) => (e.event === "labeled" || e.event === "unlabeled") && e.label?.name === label).at(-1);
  return last?.event === "labeled";
}

/** Eventos do PR (rótulos aplicados e removidos, com autor). events null = API indisponível ou histórico incompleto. */
async function issueEvents(): Promise<{ events: IssueEvent[] | null; reason: string }> {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: pr } = process.env;
  if (!token || !repo || !pr) return { events: null, reason: "sem acesso à API do GitHub neste ambiente" };
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const events: IssueEvent[] = [];
  for (let page = 1; page <= 10; page++) {
    const response = await fetch(`${api}/repos/${repo}/issues/${pr}/events?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return { events: null, reason: `a API respondeu ${response.status}` };
    const batch = (await response.json()) as IssueEvent[];
    events.push(...batch);
    if (batch.length < 100) return { events, reason: "" };
  }
  // A API devolve do mais antigo para o mais novo: cortar o fim esconderia o evento mais recente.
  return { events: null, reason: "o PR tem mais de 1.000 eventos e o histórico não foi lido inteiro" };
}

function labelHistory(events: IssueEvent[]): string[] {
  return events
    .filter((e) => (e.event === "labeled" || e.event === "unlabeled") && e.label?.name === APPROVAL_LABEL)
    .map((e) => `Rótulo \`${APPROVAL_LABEL}\` ${e.event === "labeled" ? "aplicado" : "removido"} por @${e.actor?.login ?? "desconhecido"} em ${e.created_at}.`);
}

function report(lines: string[]): void {
  const text = lines.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
}

async function main(): Promise<number> {
  const errors: string[] = [];
  const notes: string[] = [];

  // 1. Nada pulado ou isolado, com ou sem aprovação.
  const headFiles = listTestFiles(DIR);
  let headCount = 0;
  for (const file of headFiles) {
    const source = readFileSync(file, "utf-8");
    headCount += countTests(source);
    source.split("\n").forEach((line, i) => {
      if (SKIP_PATTERN.test(line)) errors.push(`\`${file}:${i + 1}\` pula ou isola um teste: \`${line.trim()}\``);
    });
  }

  // 2, 3 e 4. Em PRs e no uso local: compara com a branch de destino. Em push na main, não há com o que comparar.
  if (process.env.EVENT_NAME !== "push") {
    const baseRef = `origin/${process.env.BASE_REF || "main"}`;
    const labels = JSON.parse(process.env.PR_LABELS || "[]") as string[] | null;
    let approved = (labels ?? []).includes(APPROVAL_LABEL);

    const changed = git("diff", "--name-only", `${baseRef}...HEAD`, "--", DIR).split("\n").filter(Boolean);
    const baseFiles = git("ls-tree", "-r", "--name-only", baseRef, "--", DIR)
      .split("\n")
      .filter((f) => f.endsWith(".ts"));
    const baseCount = baseFiles.reduce((sum, f) => sum + countTests(git("show", `${baseRef}:${f}`)), 0);

    notes.push(`Testes de invariantes: ${baseCount} na \`${baseRef}\` → ${headCount} neste PR.`);

    // 4. O rótulo só vale se quem o aplicou por último é dono de tests/invariants/ na branch de destino.
    if (approved && (changed.length > 0 || headCount < baseCount)) {
      const { events, reason } = await issueEvents();
      if (!events) {
        if (process.env.EVENT_NAME === "pull_request") {
          approved = false;
          errors.push(`Não deu para conferir quem aplicou o rótulo \`${APPROVAL_LABEL}\` (${reason}). Rode o job de novo.`);
        } else {
          notes.push(`Quem aplicou o rótulo: não verificado (${reason}).`);
        }
      } else if (!isLabeled(events, APPROVAL_LABEL)) {
        approved = false;
        notes.push(...labelHistory(events));
        errors.push(`O rótulo \`${APPROVAL_LABEL}\` não está aplicado agora (foi removido depois deste evento).`);
      } else {
        notes.push(...labelHistory(events));
        const codeowners = git("ls-tree", "--name-only", baseRef, ".github/CODEOWNERS").trim()
          ? git("show", `${baseRef}:.github/CODEOWNERS`)
          : "";
        const owners = ownersOf(codeowners, `${DIR}/`);
        const labeler = lastLabeler(events, APPROVAL_LABEL);
        if (owners.length === 0) {
          approved = false;
          errors.push(`O CODEOWNERS da \`${baseRef}\` não define dono para \`${DIR}/\`: ninguém consegue aprovar.`);
        } else if (!labeler || !owners.includes(labeler.toLowerCase())) {
          approved = false;
          const list = owners.map((o) => `@${o}`).join(", ");
          errors.push(`O rótulo \`${APPROVAL_LABEL}\` foi aplicado por @${labeler ?? "desconhecido"}, que não é dono de \`${DIR}/\` (${list}).`);
        }
      }
    }

    if (changed.length > 0) {
      const list = changed.map((f) => `\`${f}\``).join(", ");
      if (approved) notes.push(`Arquivos protegidos alterados com o rótulo \`${APPROVAL_LABEL}\`: ${list}.`);
      else errors.push(`Este PR altera arquivos protegidos sem um rótulo \`${APPROVAL_LABEL}\` válido: ${list}.`);
    }
    if (headCount < baseCount && !approved) {
      errors.push(`O número de testes de invariantes caiu de ${baseCount} para ${headCount}.`);
    }
  } else {
    notes.push(`Testes de invariantes: ${headCount}.`);
  }

  if (errors.length > 0) {
    report([
      "## ❌ Guarda dos invariantes",
      "",
      ...errors.map((e) => `- ${e}`),
      "",
      ...notes.map((n) => `- ${n}`),
      "",
      "Invariantes só mudam com decisão do dono (veja `tests/invariants/README.md`).",
      `Agente: pare e pergunte. Dono: se a mudança é intencional, aplique você mesmo o rótulo \`${APPROVAL_LABEL}\` ao PR.`,
    ]);
    return 1;
  }

  report(["## ✅ Guarda dos invariantes", "", ...notes.map((n) => `- ${n}`), "- Nenhum teste pulado ou isolado."]);
  return 0;
}

// Executado direto (CI ou npm run): roda a guarda. Importado (testes): só expõe as funções acima.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
