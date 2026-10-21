// Fluxo dos evals no modo do CI, com o provedor mock (sem rede e sem custo):
// régua da branch de destino e golden set protegido.

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

test("evals: base igual ao PR passa", async () => {
  const r = await evals();
  assert.equal(r.code, 0, r.out);
});

test("evals: caso do golden set apagado no PR falha sem o rótulo e passa com ele", async () => {
  const golden = join(base, "evals/golden/classify-message.jsonl");
  const original = readFileSync(golden, "utf-8");
  writeFileSync(golden, original + JSON.stringify({ id: "so-na-base", input: "x", expected: { category: "outro" } }) + "\n");
  try {
    const r = await evals();
    assert.equal(r.code, 1);
    assert.match(r.out, /apagados \(so-na-base\)/);
    const ok = await evals({ PR_LABELS: '["eval-aprovado"]' });
    assert.equal(ok.code, 0, ok.out);
    assert.match(ok.out, /Aprovado pelo rótulo/);
  } finally {
    writeFileSync(golden, original);
  }
});

test("evals: limite da branch de destino vale, mesmo que o PR o afrouxe", async () => {
  const cfgPath = join(base, "evals/config.json");
  const original = readFileSync(cfgPath, "utf-8");
  const cfg = JSON.parse(original) as { suites: Array<{ thresholds: { accuracy: number } }> };
  cfg.suites[0]!.thresholds.accuracy = 1.01; // impossível de atingir
  writeFileSync(cfgPath, JSON.stringify(cfg));
  try {
    const r = await evals();
    assert.equal(r.code, 1, "limite da base reprova");
    assert.match(r.out, /mínimo 101\.0%/);
  } finally {
    writeFileSync(cfgPath, original);
  }
});

test("evals: suite removida ou golden trocado por outro arquivo também exigem o rótulo", async () => {
  const cfgPath = join(base, "evals/config.json");
  const original = readFileSync(cfgPath, "utf-8");
  const cfg = JSON.parse(original) as { suites: Array<{ name: string; golden: string }> };
  const first = cfg.suites[0]!;
  // Na base, a suite lia outro arquivo (com um caso a mais); no PR, aponta para o atual.
  writeFileSync(join(base, "evals/golden/antigo.jsonl"), readFileSync(first.golden, "utf-8") + JSON.stringify({ id: "so-no-antigo", input: "x", expected: { category: "outro" } }) + "\n");
  cfg.suites = [{ ...first, golden: "evals/golden/antigo.jsonl" }, { ...first, name: "removida-no-pr" }];
  writeFileSync(cfgPath, JSON.stringify(cfg));
  try {
    const r = await evals();
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /apagados \(so-no-antigo\)/);
    assert.match(r.out, /Suite `removida-no-pr` removida/);
  } finally {
    writeFileSync(cfgPath, original);
  }
});

test("evals: EVAL_MAX_CALLS inválido falha em vez de desligar o teto; vazio usa o da config", async () => {
  const r = await evals({ EVAL_MAX_CALLS: "abc" });
  assert.equal(r.code, 1);
  const vazio = await evals({ EVAL_MAX_CALLS: "" });
  assert.equal(vazio.code, 0, vazio.out);
});
