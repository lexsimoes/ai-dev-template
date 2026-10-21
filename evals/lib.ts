// Pure parts of the evals (no network): trusted thresholds, protected golden set, cost and comment.
// Tested in tests/unit/evals-lib.test.ts.

import { matchesAny } from "../scripts/review/lib.ts";

export interface GoldenCase {
  id: string;
  input: string;
  expected: { category?: string };
  mustNotContain?: string[];
  rubric?: string;
  tags?: string[];
}

export interface Suite {
  name: string;
  golden: string;
  target: string;
  thresholds: { accuracy: number; rulePassRate: number; judgeAverage?: number };
  maxDropFromBaseline: number;
}

export interface EvalConfig {
  /** No-key mode: CI runs no model, only the golden set guard. The text says why. Honored from the target branch only. */
  disabled?: string;
  maxCalls: number;
  /** Paths that, when changed in a PR, make the evals run in CI. */
  aiPaths: string[];
  /** Price per million tokens, per model (for the cost estimate). */
  pricing: Record<string, { input: number; output: number }>;
  suites: Suite[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function touchesAi(changedPaths: string[], config: Pick<EvalConfig, "aiPaths">): string[] {
  return changedPaths.filter((p) => matchesAny(p, config.aiPaths));
}

/**
 * Trusted thresholds: limits, maximum drop and call ceiling come from the target branch.
 * New suites (that do not exist there yet) use the PR's limits.
 */
export function trustedConfig(pr: EvalConfig, base: EvalConfig | null): { config: EvalConfig; notes: string[] } {
  if (!base) return { config: pr, notes: ["No config on the target branch: using the PR's own limits."] };
  const notes: string[] = [];
  const suites = pr.suites.map((s) => {
    const b = base.suites.find((x) => x.name === s.name);
    if (!b) {
      notes.push(`New suite \`${s.name}\`: PR limits (they do not exist on the target branch).`);
      return s;
    }
    if (JSON.stringify(b.thresholds) !== JSON.stringify(s.thresholds) || b.maxDropFromBaseline !== s.maxDropFromBaseline) {
      notes.push(`Suite \`${s.name}\`: the PR changes the limits; the target branch's limits apply.`);
    }
    return { ...s, thresholds: b.thresholds, maxDropFromBaseline: b.maxDropFromBaseline };
  });
  return { config: { ...pr, maxCalls: Math.min(pr.maxCalls, base.maxCalls), suites }, notes };
}

/**
 * Suites to protect: all suites from the target branch, with the golden file there and the PR's one.
 * Comes from the base config so the PR cannot escape by pointing `golden` to another file or deleting the suite.
 */
export function protectedSuites(base: EvalConfig, pr: EvalConfig): Array<{ name: string; baseGolden: string; prGolden: string | null }> {
  return base.suites.map((b) => ({ name: b.name, baseGolden: b.golden, prGolden: pr.suites.find((s) => s.name === b.name)?.golden ?? null }));
}

/** Golden set cases the PR deleted or changed (input, expected, rules or judge criterion). Adding cases is free. */
export function goldenChanges(base: GoldenCase[], pr: GoldenCase[]): { removed: string[]; changed: string[] } {
  const byId = new Map(pr.map((c) => [c.id, c]));
  const removed: string[] = [];
  const changed: string[] = [];
  for (const b of base) {
    const p = byId.get(b.id);
    if (!p) removed.push(b.id);
    else if (
      p.input !== b.input ||
      JSON.stringify(p.expected) !== JSON.stringify(b.expected) ||
      JSON.stringify(p.mustNotContain ?? []) !== JSON.stringify(b.mustNotContain ?? []) ||
      (p.rubric ?? "") !== (b.rubric ?? "")
    ) {
      changed.push(b.id);
    }
  }
  return { removed, changed };
}

/** Model price: exact name or the longest matching prefix (e.g. "deepseek-v4-pro"). */
export function priceFor(config: Pick<EvalConfig, "pricing">, model: string): { input: number; output: number } | null {
  const key = Object.keys(config.pricing)
    .filter((k) => model === k || model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? (config.pricing[key] ?? null) : null;
}

export function estimateCost(price: { input: number; output: number } | null, usage: TokenUsage): number | null {
  return price ? (usage.inputTokens / 1e6) * price.input + (usage.outputTokens / 1e6) * price.output : null;
}

export const EVAL_COMMENT_MARKER = "<!-- automated-evals -->";

export function renderEvalComment(input: {
  summaryTable: string;
  model: string;
  calls: number;
  maxCalls: number;
  usage: TokenUsage;
  cost: number | null;
  baselineNote: string;
  notes: string[];
  failed: boolean;
}): string {
  const cost = input.cost === null ? "no price configured" : `≈ $${input.cost.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  return [
    EVAL_COMMENT_MARKER,
    `## 🧪 Evals ${input.failed ? "❌ failed (reason below)" : "✅ within limits"}`,
    "",
    input.summaryTable,
    "",
    `- Model: \`${input.model}\` · calls: ${input.calls} of at most ${input.maxCalls}`,
    `- Tokens: ${input.usage.inputTokens.toLocaleString("en-US")} input + ${input.usage.outputTokens.toLocaleString("en-US")} output · cost ${cost} (estimate from list price)`,
    `- Baseline: ${input.baselineNote}`,
    ...input.notes.map((n) => `- ${n}`),
  ].join("\n");
}

/** Comment for the no-key mode: says clearly that no model ran, what still did, and how to fix a red check. */
export function renderDisabledComment(reason: string, goldenFailures: string[], notes: string[]): string {
  const head = goldenFailures.length
    ? [
        "## 🧪 Evals ❌ blocked: golden set weakened",
        "",
        `> The evals with an AI model are off in this repository (${reason}), but the golden set guard always runs: it needs no key.`,
        "> **To turn this check green**, either:",
        "> - restore the golden set cases listed below (adding new cases is always free); or",
        "> - if the change is intended, the **owner** applies the `eval-approved` label to this PR (the check runs again on its own). Agents never apply it.",
      ]
    : [
        "## 🧪 Evals ⏸️ off in this repository",
        "",
        `> No AI model ran: ${reason}`,
        "> Only the golden set guard ran (deleting or changing cases needs the owner's label). To turn the evals on, see `docs/WORKFLOW.md` (\"No-key mode\").",
      ];
  return [EVAL_COMMENT_MARKER, ...head, "", ...goldenFailures.map((f) => `- ❌ ${f}`), ...notes.map((n) => `- ${n}`)].join("\n").trimEnd();
}
