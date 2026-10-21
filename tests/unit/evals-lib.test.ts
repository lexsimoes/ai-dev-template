import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost, goldenChanges, priceFor, protectedSuites, renderEvalComment, touchesAi, trustedConfig } from "../../evals/lib.ts";
import type { EvalConfig, GoldenCase } from "../../evals/lib.ts";

const suite = { name: "s", golden: "g.jsonl", target: "t", thresholds: { accuracy: 0.9, rulePassRate: 1 }, maxDropFromBaseline: 0.05 };
const cfg = (over: Partial<EvalConfig> = {}): EvalConfig => ({ maxCalls: 60, aiPaths: ["src/ai/**", "evals/**"], pricing: {}, suites: [suite], ...over });
const gc = (id: string, over: Partial<GoldenCase> = {}): GoldenCase => ({ id, input: `entrada ${id}`, expected: { category: "outro" }, ...over });

test("caminhos de IA: só os listados em aiPaths disparam os evals", () => {
  assert.deepEqual(touchesAi(["README.md", "src/ai/x.ts", "evals/golden/a.jsonl"], cfg()), ["src/ai/x.ts", "evals/golden/a.jsonl"]);
  assert.deepEqual(touchesAi(["docs/a.md"], cfg()), []);
});

test("régua confiável: limites e teto da branch de destino valem sobre os do PR", () => {
  const pr = cfg({ maxCalls: 500, suites: [{ ...suite, thresholds: { accuracy: 0.1, rulePassRate: 0 } }, { ...suite, name: "nova" }] });
  const { config, notes } = trustedConfig(pr, cfg());
  assert.equal(config.maxCalls, 60);
  assert.deepEqual(config.suites[0]?.thresholds, suite.thresholds);
  assert.equal(config.suites[1]?.name, "nova", "suite nova usa os limites do PR");
  assert.match(notes.join(), /muda os limites/);
  assert.match(notes.join(), /Suite nova/);
});

test("golden set: apagar ou alterar casos é detectado; acrescentar é livre", () => {
  const base = [gc("a"), gc("b"), gc("c", { mustNotContain: ["x"] })];
  const pr = [gc("a"), gc("b", { expected: { category: "troca" } }), gc("c"), gc("novo")];
  assert.deepEqual(goldenChanges(base, pr), { removed: [], changed: ["b", "c"] });
  assert.deepEqual(goldenChanges(base, [gc("a")]), { removed: ["b", "c"], changed: [] });
  assert.deepEqual(goldenChanges(base, [...base, gc("d")]), { removed: [], changed: [] });
  assert.deepEqual(goldenChanges([gc("a", { rubric: "rigoroso" })], [gc("a", { rubric: "qualquer" })]).changed, ["a"]);
});

test("golden set: as suites protegidas vêm da branch de destino", () => {
  const base = cfg({ suites: [suite, { ...suite, name: "outra" }] });
  const pr = cfg({ suites: [{ ...suite, golden: "novo.jsonl" }] });
  assert.deepEqual(protectedSuites(base, pr), [
    { name: "s", baseGolden: "g.jsonl", prGolden: "novo.jsonl" },
    { name: "outra", baseGolden: "g.jsonl", prGolden: null },
  ]);
});

test("custo: preço pelo prefixo mais longo do nome do modelo", () => {
  const c = cfg({ pricing: { deepseek: { input: 9, output: 9 }, "deepseek-v4-pro": { input: 1.32, output: 3.96 } } });
  assert.deepEqual(priceFor(c, "deepseek-v4-pro"), { input: 1.32, output: 3.96 });
  assert.equal(priceFor(c, "outro-modelo"), null);
  assert.equal(estimateCost({ input: 1, output: 2 }, { inputTokens: 1e6, outputTokens: 1e6 }), 3);
  assert.equal(estimateCost(null, { inputTokens: 1, outputTokens: 1 }), null);
});

test("comentário dos evals: marcador, status e custo", () => {
  const md = renderEvalComment({ summaryTable: "| t |", model: "m", calls: 3, maxCalls: 60, usage: { inputTokens: 1000, outputTokens: 10 }, cost: 0.0123, baselineNote: "b", notes: [], failed: true });
  assert.match(md, /^<!-- evals-automaticos -->/);
  assert.match(md, /❌/);
  assert.match(md, /US\$ 0,0123/);
});
