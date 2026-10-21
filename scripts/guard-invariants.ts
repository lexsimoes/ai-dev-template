// Guarda dos invariantes, executada pelo job "invariantes" do CI.
// Falha quando:
//   1. um teste em tests/invariants/ é pulado ou isolado (.skip, .todo, .only, { skip: ... });
//   2. o PR altera tests/invariants/ sem o rótulo "invariante-aprovado" (dado pelo dono);
//   3. o número de testes de invariantes diminui sem esse rótulo.
//
// Variáveis de ambiente (preenchidas pelo workflow):
//   EVENT_NAME  "pull_request" ou "push" (vazio = uso local, compara com a main)
//   BASE_REF    branch de destino do PR (ex.: "main")
//   PR_LABELS   JSON com os nomes dos rótulos do PR
//
// Uso local: npm run guard:invariants  (depois de git fetch origin main)

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

function report(lines: string[]): void {
  const text = lines.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
}

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

// 2 e 3. Em PRs e no uso local: compara com a branch de destino. Em push na main, não há com o que comparar.
if (process.env.EVENT_NAME !== "push") {
  const baseRef = `origin/${process.env.BASE_REF || "main"}`;
  const labels = JSON.parse(process.env.PR_LABELS || "[]") as string[] | null;
  const approved = (labels ?? []).includes(APPROVAL_LABEL);

  const changed = git("diff", "--name-only", `${baseRef}...HEAD`, "--", DIR).split("\n").filter(Boolean);
  const baseFiles = git("ls-tree", "-r", "--name-only", baseRef, "--", DIR)
    .split("\n")
    .filter((f) => f.endsWith(".ts"));
  const baseCount = baseFiles.reduce((sum, f) => sum + countTests(git("show", `${baseRef}:${f}`)), 0);

  notes.push(`Testes de invariantes: ${baseCount} na \`${baseRef}\` → ${headCount} neste PR.`);

  if (changed.length > 0) {
    const list = changed.map((f) => `\`${f}\``).join(", ");
    if (approved) notes.push(`Arquivos protegidos alterados com o rótulo \`${APPROVAL_LABEL}\`: ${list}.`);
    else errors.push(`Este PR altera arquivos protegidos sem o rótulo \`${APPROVAL_LABEL}\`: ${list}.`);
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
    `Agente: pare e pergunte. Dono: se a mudança é intencional, aplique o rótulo \`${APPROVAL_LABEL}\` ao PR.`,
  ]);
  process.exit(1);
}

report(["## ✅ Guarda dos invariantes", "", ...notes.map((n) => `- ${n}`), "- Nenhum teste pulado ou isolado."]);
