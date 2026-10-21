// Evals flow in CI mode, with the mock provider (no network and no cost):
// target-branch thresholds and protected golden set.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
  // A project created without an AI key has the evals off ("disabled"); these tests measure the flow with them on.
  const cfgPath = join(base, "evals/config.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf-8")) as { disabled?: string };
  delete cfg.disabled;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
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
  writeFileSync(golden, original + JSON.stringify({ id: "base-only", input: "x", expected: { category: "other" } }) + "\n");
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
  writeFileSync(join(base, "evals/golden/old.jsonl"), readFileSync(first.golden, "utf-8") + JSON.stringify({ id: "old-only", input: "x", expected: { category: "other" } }) + "\n");
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

test("evals no-key mode: switched on in the target branch, no model runs and the golden set guard still does", async () => {
  const cfgPath = join(base, "evals/config.json");
  const original = readFileSync(cfgPath, "utf-8");
  const golden = join(base, "evals/golden/classify-message.jsonl");
  const originalGolden = readFileSync(golden, "utf-8");
  writeFileSync(cfgPath, JSON.stringify({ ...(JSON.parse(original) as object), disabled: "no AI key in this test" }));
  // A real provider with no key: any model call would fail the run.
  const noKey = { LLM_API_KEY: "", ANTHROPIC_API_KEY: "" };
  const realProvider = ["evals/run.ts", "--provider", "openai-compatible", "--base-dir", base, "--out", out];
  const go = (env: Record<string, string>) =>
    run("node", realProvider, { env: { ...process.env, GITHUB_STEP_SUMMARY: "", PR_LABELS: "[]", ...noKey, ...env } }).then(
      (r) => ({ code: 0, out: r.stdout }),
      (e: { code?: number; stdout?: string }) => ({ code: e.code ?? 1, out: e.stdout ?? "" }),
    );
  try {
    const off = await go({});
    assert.equal(off.code, 0, off.out);
    assert.match(off.out, /Evals ⏸️ off in this repository/);
    assert.match(off.out, /no AI key in this test/);

    writeFileSync(golden, originalGolden + JSON.stringify({ id: "base-only", input: "x", expected: { category: "other" } }) + "\n");
    const weakened = await go({});
    assert.equal(weakened.code, 1, "deleting a golden case still needs the owner's label");
    assert.match(weakened.out, /deleted \(base-only\)/);
    assert.match(weakened.out, /blocked: golden set weakened/);
    assert.match(weakened.out, /To turn this check green/);
    assert.match(weakened.out, /restore the golden set cases/);
    assert.match(weakened.out, /owner\*\* applies the `eval-approved` label/);
    assert.equal((await go({ PR_LABELS: '["eval-approved"]' })).code, 0);
  } finally {
    writeFileSync(cfgPath, original);
    writeFileSync(golden, originalGolden);
  }
});

test("evals no-key mode is never inferred: the switch only in the PR, or no switch, and a missing key fails", async () => {
  const pr = mkdtempSync(join(tmpdir(), "evals-pr-"));
  try {
    cpSync("evals", join(pr, "evals"), { recursive: true });
    for (const d of ["src", "scripts"]) cpSync(d, join(pr, d), { recursive: true });
    symlinkSync(resolve("node_modules"), join(pr, "node_modules"), "dir");
    const cfgPath = join(pr, "evals/config.json");
    writeFileSync(cfgPath, JSON.stringify({ ...(JSON.parse(readFileSync(cfgPath, "utf-8")) as object), disabled: "set by the PR itself" }));
    const r = await run("node", ["evals/run.ts", "--provider", "openai-compatible", "--base-dir", base, "--out", out], {
      cwd: pr,
      env: { ...process.env, GITHUB_STEP_SUMMARY: "", PR_LABELS: "[]", LLM_API_KEY: "", LLM_BASE_URL: "http://127.0.0.1:9", LLM_MODEL: "m" },
    }).then(
      () => ({ code: 0, out: "" }),
      (e: { code?: number; stdout?: string; stderr?: string }) => ({ code: e.code ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }),
    );
    assert.notEqual(r.code, 0, "the PR's own switch is ignored, and without a key the run fails");
    assert.doesNotMatch(r.out, /off in this repository/);
    assert.match(r.out, /LLM_API_KEY/, r.out);
  } finally {
    rmSync(pr, { recursive: true, force: true });
  }
});

test("touches-ai: reports the no-key switch to the workflow", async () => {
  const dir = mkdtempSync(join(tmpdir(), "touches-"));
  try {
    const output = join(dir, "out");
    const cfg = join(dir, "config.json");
    writeFileSync(cfg, JSON.stringify({ aiPaths: ["**"], disabled: "x" }));
    writeFileSync(output, "");
    await run("node", ["evals/touches-ai.ts", "--base", "HEAD", "--config", cfg], { env: { ...process.env, GITHUB_OUTPUT: output } });
    assert.match(readFileSync(output, "utf-8"), /^disabled=true$/m);
    writeFileSync(cfg, JSON.stringify({ aiPaths: ["**"] }));
    writeFileSync(output, "");
    await run("node", ["evals/touches-ai.ts", "--base", "HEAD", "--config", cfg], { env: { ...process.env, GITHUB_OUTPUT: output } });
    assert.match(readFileSync(output, "utf-8"), /^disabled=false$/m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
