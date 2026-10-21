// Diz se o PR tocou em arquivos de IA (aiPaths em evals/config.json) e grava em GITHUB_OUTPUT.
// Uso: node evals/touches-ai.ts --base origin/main [--config caminho/da/config.json]
// No CI, a config vem da branch de destino: um PR não foge dos evals mudando aiPaths.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { touchesAi } from "./lib.ts";
import type { EvalConfig } from "./lib.ts";

const { values } = parseArgs({ options: { base: { type: "string", default: "origin/main" }, config: { type: "string", default: "evals/config.json" } } });
const config = JSON.parse(readFileSync(values.config, "utf-8")) as Partial<EvalConfig>;
// Configuração antiga, sem aiPaths: na dúvida, roda os evals.
const aiPaths = config.aiPaths ?? ["**"];
const changed = execFileSync("git", ["-c", "core.quotePath=false", "diff", "--name-only", "-z", `${values.base}...HEAD`], { encoding: "utf-8" })
  .split("\0")
  .filter(Boolean);
const hits = touchesAi(changed, { aiPaths });

console.log(hits.length ? `Arquivos de IA no PR: ${hits.join(", ")}` : "O PR não toca em arquivos de IA: evals dispensados.");
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tocou=${hits.length > 0}\n`);
