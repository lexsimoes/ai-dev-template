// Fixed reviewer config for the reviewer tests: the project's own .github/review.json, with fixed tiers.
// A project can pick another provider (or none) in Copier, and the tests must still check the same flow and prices.

import { readFileSync } from "node:fs";
import type { ReviewConfig } from "../../scripts/review/lib.ts";

export const TEST_TIERS: ReviewConfig["tiers"] = {
  standard: { provider: "openai-compatible", baseUrl: "http://unused", model: "fake-model", apiKeyEnv: "REVIEW_API_KEY", maxOutputTokens: 64000, pricePerMTok: { input: 1.32, output: 3.96, cachedInput: 0.044 } },
  light: { provider: "openai-compatible", baseUrl: "http://unused", model: "fake-model", apiKeyEnv: "REVIEW_API_KEY", maxOutputTokens: 16000, extraBody: { reasoning_effort: "low" }, pricePerMTok: { input: 1.32, output: 3.96, cachedInput: 0.044 } },
  sensitive: { provider: "anthropic", model: "claude-sonnet-5-5", apiKeyEnv: "REVIEW_DEEP_API_KEY", maxOutputTokens: 64000, pricePerMTok: { input: 2, output: 10, cachedInput: 0.1 } },
  deep: { provider: "anthropic", model: "claude-opus-5-5", apiKeyEnv: "REVIEW_DEEP_API_KEY", maxOutputTokens: 64000, pricePerMTok: { input: 4, output: 20, cachedInput: 0.2 } },
};

export function testConfig(): ReviewConfig {
  const config = JSON.parse(readFileSync(".github/review.json", "utf-8")) as ReviewConfig & { disabled?: unknown };
  delete config.disabled;
  return { ...config, tiers: TEST_TIERS };
}
