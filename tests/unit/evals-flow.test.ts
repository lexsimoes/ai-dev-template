// Evals flow in CI mode, with the mock provider (no network and no cost):
// target-branch thresholds and protected golden set.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
let base = "";
let out = "";

async function evals(env: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  try {
    const r = await run("node", ["evals/run.ts", "--provider", "mock", "--base-dir", base, "--out", out], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: "", PR_LABELS: "[]", ...env },
    });
    return { code: 0, out: r.stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return { code: err.code ?? 1, out: err.stdout ?? "" };
  }
}

before(() => {
  base = mkdtempSync(join(tmpdir(), "evals-base-"));
  out = mkdtempSync(join(tmpdir(), "evals-out-"));
  cpSync("evals", join(base, "evals"), { recursive: true });
});
after(() => {
  rmSync(base, { recursive: true, force: true });
  rmSync(out, { recursive: true, force: true });
});

test("evals: base equal to the PR passes", async () => {
  const r = await evals();
  assert.equal(r.code, 0, r.out);
});

test("evals: golden set case deleted in the PR fails without the label and passes with it", async () => {
  const golden = join(base, "evals/golden/classify-message.jsonl");
  const original = readFileSync(golden, "utf-8");
  writeFileSync(golden, original + JSON.stringify({ id: "base-only", input: "x", expected: { category: "outro" } }) + "\n");
  try {
    const r = await evals();
    assert.equal(r.code, 1);
    assert.match(r.out, /deleted \(base-only\)/);
    const ok = await evals({ PR_LABELS: '["eval-approved"]' });
    assert.equal(ok.code, 0, ok.out);
    assert.match(ok.out, /Approved by the `eval-approved` label/);
  } finally {
    writeFileSync(golden, original);
  }
});

test("evals: the target branch's limit applies, even if the PR loosens it", async () => {
  const cfgPath = join(base, "evals/config.json");
  const original = readFileSync(cfgPath, "utf-8");
  const cfg = JSON.parse(original) as { suites: Array<{ thresholds: { accuracy: number } }> };
  cfg.suites[0]!.thresholds.accuracy = 1.01; // impossible to reach
  writeFileSync(cfgPath, JSON.stringify(cfg));
  try {
    const r = await evals();
    assert.equal(r.code, 1, "the base limit fails the run");
    assert.match(r.out, /minimum 101\.0%/);
  } finally {
    writeFileSync(cfgPath, original);
  }
});

test("evals: a removed suite or a golden file swapped for another also require the label", async () => {
  const cfgPath = join(base, "evals/config.json");
  const original = readFileSync(cfgPath, "utf-8");
  const cfg = JSON.parse(original) as { suites: Array<{ name: string; golden: string }> };
  const first = cfg.suites[0]!;
  // On the base, the suite read another file (with one extra case); in the PR, it points to the current one.
  writeFileSync(join(base, "evals/golden/old.jsonl"), readFileSync(first.golden, "utf-8") + JSON.stringify({ id: "old-only", input: "x", expected: { category: "outro" } }) + "\n");
  cfg.suites = [{ ...first, golden: "evals/golden/old.jsonl" }, { ...first, name: "removed-in-pr" }];
  writeFileSync(cfgPath, JSON.stringify(cfg));
  try {
    const r = await evals();
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /deleted \(old-only\)/);
    assert.match(r.out, /Suite `removed-in-pr` removed/);
  } finally {
    writeFileSync(cfgPath, original);
  }
});

test("evals: invalid EVAL_MAX_CALLS fails instead of turning off the ceiling; empty uses the config's", async () => {
  const r = await evals({ EVAL_MAX_CALLS: "abc" });
  assert.equal(r.code, 1);
  const vazio = await evals({ EVAL_MAX_CALLS: "" });
  assert.equal(vazio.code, 0, vazio.out);
});

test("evals: with --require-baseline, a target-branch suite without a baseline fails", async () => {
  const semBase = join(out, "does-not-exist");
  const args = ["evals/run.ts", "--provider", "mock", "--base-dir", base, "--out", out, "--baseline", semBase];
  const env = { ...process.env, GITHUB_STEP_SUMMARY: "", PR_LABELS: "[]" };
  const livre = await run("node", args, { env }).then(() => 0, (e: { code?: number }) => e.code ?? 1);
  assert.equal(livre, 0, "without the option, a missing baseline is only a notice");
  const exigida = await run("node", [...args, "--require-baseline"], { env }).then(
    () => ({ code: 0, out: "" }),
    (e: { code?: number; stdout?: string }) => ({ code: e.code ?? 1, out: e.stdout ?? "" }),
  );
  assert.equal(exigida.code, 1);
  assert.match(exigida.out, /no baseline/);
});
