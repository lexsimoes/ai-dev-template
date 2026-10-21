import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost, goldenChanges, priceFor, protectedSuites, renderEvalComment, touchesAi, trustedConfig } from "../../evals/lib.ts";
import type { EvalConfig, GoldenCase } from "../../evals/lib.ts";

const suite = { name: "s", golden: "g.jsonl", target: "t", thresholds: { accuracy: 0.9, rulePassRate: 1 }, maxDropFromBaseline: 0.05 };
const cfg = (over: Partial<EvalConfig> = {}): EvalConfig => ({ maxCalls: 60, aiPaths: ["src/ai/**", "evals/**"], pricing: {}, suites: [suite], ...over });
const gc = (id: string, over: Partial<GoldenCase> = {}): GoldenCase => ({ id, input: `input ${id}`, expected: { category: "other" }, ...over });

test("AI paths: only those listed in aiPaths trigger the evals", () => {
  assert.deepEqual(touchesAi(["README.md", "src/ai/x.ts", "evals/golden/a.jsonl"], cfg()), ["src/ai/x.ts", "evals/golden/a.jsonl"]);
  assert.deepEqual(touchesAi(["docs/a.md"], cfg()), []);
});

test("trusted thresholds: the target branch's limits and ceiling override the PR's", () => {
  const pr = cfg({ maxCalls: 500, suites: [{ ...suite, thresholds: { accuracy: 0.1, rulePassRate: 0 } }, { ...suite, name: "new" }] });
  const { config, notes } = trustedConfig(pr, cfg());
  assert.equal(config.maxCalls, 60);
  assert.deepEqual(config.suites[0]?.thresholds, suite.thresholds);
  assert.equal(config.suites[1]?.name, "new", "new suite uses the PR's limits");
  assert.match(notes.join(), /changes the limits/);
  assert.match(notes.join(), /New suite/);
});

test("golden set: deleting or changing cases is detected; adding is free", () => {
  const base = [gc("a"), gc("b"), gc("c", { mustNotContain: ["x"] })];
  const pr = [gc("a"), gc("b", { expected: { category: "exchange" } }), gc("c"), gc("new")];
  assert.deepEqual(goldenChanges(base, pr), { removed: [], changed: ["b", "c"] });
  assert.deepEqual(goldenChanges(base, [gc("a")]), { removed: ["b", "c"], changed: [] });
  assert.deepEqual(goldenChanges(base, [...base, gc("d")]), { removed: [], changed: [] });
  assert.deepEqual(goldenChanges([gc("a", { rubric: "strict" })], [gc("a", { rubric: "any" })]).changed, ["a"]);
});

test("golden set: the protected suites come from the target branch", () => {
  const base = cfg({ suites: [suite, { ...suite, name: "other" }] });
  const pr = cfg({ suites: [{ ...suite, golden: "new.jsonl" }] });
  assert.deepEqual(protectedSuites(base, pr), [
    { name: "s", baseGolden: "g.jsonl", prGolden: "new.jsonl" },
    { name: "other", baseGolden: "g.jsonl", prGolden: null },
  ]);
});

test("cost: price by the longest prefix of the model name", () => {
  const c = cfg({ pricing: { deepseek: { input: 9, output: 9 }, "deepseek-v4-pro": { input: 1.32, output: 3.96 } } });
  assert.deepEqual(priceFor(c, "deepseek-v4-pro"), { input: 1.32, output: 3.96 });
  assert.equal(priceFor(c, "other-model"), null);
  assert.equal(estimateCost({ input: 1, output: 2 }, { inputTokens: 1e6, outputTokens: 1e6 }), 3);
  assert.equal(estimateCost(null, { inputTokens: 1, outputTokens: 1 }), null);
});

test("evals comment: marker, status and cost", () => {
  const md = renderEvalComment({ summaryTable: "| t |", model: "m", calls: 3, maxCalls: 60, usage: { inputTokens: 1000, outputTokens: 10 }, cost: 0.0123, baselineNote: "b", notes: [], failed: true });
  assert.match(md, /^<!-- automated-evals -->/);
  assert.match(md, /❌/);
  assert.match(md, /≈ \$0\.0123/);
});
