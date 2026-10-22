// Invariant guard, configured by an adopted project: its approval label (INVARIANT_LABEL) and its folder of
// non-negotiable tests (INVARIANTS_DIR). Defaults stay as they were; an invalid value falls back to the default.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const SCRIPT = resolve("scripts/guard-invariants.ts");

/** A repository whose `origin/main` holds two invariant folders, and a PR branch that drops a test in `rules/inv/`. */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "adt-guard-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  const write = (files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    git("add", "-A");
    git("-c", "user.email=a@b", "-c", "user.name=t", "-c", "commit.gpgsign=false", "commit", "-qm", "c");
  };
  git("init", "-q", "-b", "main");
  write({ "rules/inv/a.test.ts": 'it("one", () => {});\nit("two", () => {});\n', "tests/invariants/b.test.ts": 'test("x", () => {});\n' });
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  git("switch", "-q", "-c", "pr");
  write({ "rules/inv/a.test.ts": 'it("one", () => {});\n' });
  return root;
}

function guard(root: string, env: Record<string, string>) {
  const r = spawnSync("node", [SCRIPT], { cwd: root, encoding: "utf-8", env: { ...process.env, EVENT_NAME: "pull_request", BASE_REF: "main", PR_LABELS: "[]", ...env } });
  return { code: r.status, out: r.stdout };
}

test("guard: a project's own folder and label name; the defaults when unset or invalid", () => {
  const root = repo();
  try {
    const custom = guard(root, { INVARIANTS_DIR: "rules/inv", INVARIANT_LABEL: "invariante-aprovado" });
    assert.equal(custom.code, 1);
    assert.match(custom.out, /changes protected files without a valid `invariante-aprovado` label: `rules\/inv\/a\.test\.ts`/);
    assert.match(custom.out, /Invariant tests: 2 on `origin\/main` → 1 in this PR/);

    const defaults = guard(root, {});
    assert.equal(defaults.code, 0, "by default it guards tests/invariants/, which this PR does not touch");
    assert.match(defaults.out, /Invariant tests: 1 on `origin\/main` → 1 in this PR/);

    const invalid = guard(root, { INVARIANTS_DIR: "../rules/inv", INVARIANT_LABEL: 'bad"label' });
    assert.equal(invalid.code, 0, "a folder outside the project is refused: back to tests/invariants/");
    assert.match(invalid.out, /Invariant tests: 1 on `origin\/main` → 1/);

    const badLabel = guard(root, { INVARIANTS_DIR: "rules/inv", INVARIANT_LABEL: "bad`label" });
    assert.match(badLabel.out, /without a valid `invariant-approved` label/, "an invalid label name falls back to the default");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
