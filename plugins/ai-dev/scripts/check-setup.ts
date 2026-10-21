// /ai-dev:check-setup: checks a project created from ai-dev-template and says how to fix each problem.
// Read-only: changes nothing on GitHub or in the project; secrets are listed by name, never read.
//
// Use, in the project folder: node <plugin>/scripts/check-setup.ts [--json]
// Exit code: 0 when nothing failed (warnings allowed), 1 when something must be fixed.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { checkSetup, renderReport } from "./lib/checks.ts";
import { run } from "./lib/run.ts";

const { values } = parseArgs({ options: { json: { type: "boolean", default: false } } });
const root = run("git", ["rev-parse", "--show-toplevel"]);
const dir = root.code === 0 ? root.stdout.trim() : process.cwd();

const results = checkSetup({
  run: (cmd, args) => {
    // gh and git run in the project folder, so `gh` picks this repository by default.
    const prev = process.cwd();
    process.chdir(dir);
    try {
      return run(cmd, args);
    } finally {
      process.chdir(prev);
    }
  },
  read: (path) => (existsSync(join(dir, path)) ? readFileSync(join(dir, path), "utf-8") : null),
});

console.log(values.json ? JSON.stringify(results, null, 2) : renderReport(results));
process.exit(results.some((r) => r.status === "fail") ? 1 : 0);
