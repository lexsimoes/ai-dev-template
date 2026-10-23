// The `dependencies` check in a private repository: only high or critical advisories the PR introduces block.
// The pure parts are tested here; the npm audit call itself needs the registry and runs in CI.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { advisories, introduced } from "../../scripts/dependency-audit.ts";

const via = (source: number, severity: string, name = "lodash") => ({ source, name, title: `advisory ${source}`, url: `https://github.com/advisories/${source}`, severity });

test("advisories: high and critical only, one per package and advisory; a pointer to another package is skipped", () => {
  const found = advisories({
    vulnerabilities: {
      lodash: { via: [via(1, "high"), via(2, "critical"), via(3, "moderate"), via(1, "high")] },
      "uses-lodash": { via: ["lodash"] },
    },
  });
  assert.deepEqual([...found.keys()].sort(), ["lodash#1", "lodash#2"]);
  assert.equal(found.get("lodash#2")?.severity, "critical");
  assert.equal(advisories({}).size, 0);
});

test("introduced: only advisories the target branch does not have", () => {
  const base = advisories({ vulnerabilities: { lodash: { via: [via(1, "high")] } } });
  const pr = advisories({ vulnerabilities: { lodash: { via: [via(1, "high"), via(2, "high")] }, minimist: { via: [via(9, "critical", "minimist")] } } });
  assert.deepEqual(introduced(base, pr).map((a) => a.key).sort(), ["lodash#2", "minimist#9"]);
  assert.deepEqual(introduced(pr, base), [], "removing a vulnerable package never blocks");
});

test("CLI: a PR without a lockfile has nothing to check", () => {
  const dir = mkdtempSync(join(tmpdir(), "dependency-audit-"));
  try {
    const out = execFileSync("node", [resolve("scripts/dependency-audit.ts"), dir, dir], { encoding: "utf-8", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });
    assert.match(out, /No `package-lock\.json` in this PR/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI: a PR that removes the target branch's lockfile fails", () => {
  const base = mkdtempSync(join(tmpdir(), "dependency-audit-base-"));
  const pr = mkdtempSync(join(tmpdir(), "dependency-audit-pr-"));
  try {
    copyFileSync("package-lock.json", join(base, "package-lock.json"));
    let failed = false;
    try {
      execFileSync("node", [resolve("scripts/dependency-audit.ts"), base, pr], { encoding: "utf-8", stdio: "pipe", env: { ...process.env, GITHUB_STEP_SUMMARY: "" } });
    } catch (e) {
      failed = true;
      assert.match((e as { stdout?: string }).stdout ?? "", /removes `package-lock\.json`/);
    }
    assert.ok(failed);
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(pr, { recursive: true, force: true });
  }
});

test("the CI runs it, from the target branch, only in a private repository", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf-8");
  assert.match(ci, /if: \$\{\{ !github\.event\.repository\.private \}\}\n\s+uses: actions\/dependency-review-action/);
  assert.match(ci, /if \[ -f base\/scripts\/dependency-audit\.ts \]; then checker=base\/scripts\/dependency-audit\.ts/);
});
