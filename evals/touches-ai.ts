// Says whether the PR touched AI files (aiPaths in evals/config.json) and whether the evals are off
// (`disabled`, no-key mode), and writes both to GITHUB_OUTPUT.
// Usage: node evals/touches-ai.ts --base origin/main [--config path/to/config.json]
// In CI, the config comes from the target branch: a PR cannot skip the evals by changing aiPaths.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { touchesAi } from "./lib.ts";
import type { EvalConfig } from "./lib.ts";

const { values } = parseArgs({ options: { base: { type: "string", default: "origin/main" }, config: { type: "string", default: "evals/config.json" } } });
const config = JSON.parse(readFileSync(values.config, "utf-8")) as Partial<EvalConfig>;
// Old config, without aiPaths: when in doubt, run the evals.
const aiPaths = config.aiPaths ?? ["**"];
const changed = execFileSync("git", ["-c", "core.quotePath=false", "diff", "--name-only", "-z", `${values.base}...HEAD`], { encoding: "utf-8" })
  .split("\0")
  .filter(Boolean);
const hits = touchesAi(changed, { aiPaths });

console.log(hits.length ? `AI files in the PR: ${hits.join(", ")}` : "The PR does not touch AI files: evals skipped.");
// No-key mode (from this config, the target branch's in CI): the workflow skips the key check and the baseline.
if (config.disabled && hits.length) console.log(`Evals off in this repository (${config.disabled}): only the golden set guard runs.`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `touched=${hits.length > 0}\ndisabled=${Boolean(config.disabled)}\n`);
