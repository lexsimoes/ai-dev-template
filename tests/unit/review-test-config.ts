// Fixed reviewer config for the reviewer tests: the project's own .github/review.json, with fixed tiers.
// A project can pick another provider (or none) in Copier, and the tests must still check the same flow and prices.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ReviewConfig } from "../../scripts/review/lib.ts";

export const TEST_TIERS: ReviewConfig["tiers"] = {
  standard: { provider: "openai-compatible", baseUrl: "http://unused", model: "fake-model", apiKeyEnv: "REVIEW_API_KEY", maxOutputTokens: 64000, pricePerMTok: { input: 1.32, output: 3.96, cachedInput: 0.044 } },
  light: { provider: "openai-compatible", baseUrl: "http://unused", model: "fake-model", apiKeyEnv: "REVIEW_API_KEY", maxOutputTokens: 16000, extraBody: { reasoning_effort: "low" }, pricePerMTok: { input: 1.32, output: 3.96, cachedInput: 0.044 } },
  sensitive: { provider: "anthropic", model: "claude-sonnet-5-5", apiKeyEnv: "REVIEW_DEEP_API_KEY", maxOutputTokens: 64000, pricePerMTok: { input: 2, output: 10, cachedInput: 0.1 } },
  deep: { provider: "anthropic", model: "claude-opus-5-5", apiKeyEnv: "REVIEW_DEEP_API_KEY", maxOutputTokens: 64000, pricePerMTok: { input: 4, output: 20, cachedInput: 0.2 } },
};

/** Each of the 4 tiers has a known provider, a model and its pinned version, a key variable, an output limit and prices. */
export function assertUsableTiers(tiers: ReviewConfig["tiers"]): void {
  for (const name of ["standard", "light", "sensitive", "deep"] as const) {
    const t = tiers[name];
    assert.ok(t, `tier ${name} exists`);
    assert.ok(t.provider === "openai-compatible" || t.provider === "anthropic", `tier ${name}: known provider`);
    if (t.provider === "openai-compatible") assert.ok(t.baseUrl, `tier ${name}: baseUrl`);
    assert.ok(t.model && t.apiKeyEnv, `tier ${name}: model and apiKeyEnv`);
    assert.ok(Number.isInteger(t.maxOutputTokens) && (t.maxOutputTokens ?? 0) > 0, `tier ${name}: maxOutputTokens`);
    assert.ok(t.pricePerMTok.input >= 0 && t.pricePerMTok.output >= 0, `tier ${name}: prices`);
    // An alias can move upstream: every shipped tier names the version its canary measured.
    assert.ok(t.pinnedVersion, `tier ${name}: pinnedVersion`);
  }
}

export function testConfig(): ReviewConfig {
  const config = JSON.parse(readFileSync(".github/review.json", "utf-8")) as ReviewConfig & { disabled?: unknown };
  delete config.disabled;
  return { ...config, tiers: TEST_TIERS };
}
