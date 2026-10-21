// Picks the LLM adapter from the config (LLM_PROVIDER / LLM_MODEL).

import { createAnthropicClient } from "./providers/anthropic.ts";
import { createMockClient } from "./providers/mock.ts";
import { createOpenAICompatibleClient } from "./providers/openai-compatible.ts";
import type { LLMClient } from "./types.ts";

export type { LLMClient, LLMRequest, LLMResponse } from "./types.ts";
export { LLMRefusalError } from "./types.ts";

export const PROVIDERS = ["anthropic", "openai-compatible", "mock"] as const;

export interface LLMConfig {
  provider?: string;
  model?: string;
}

export function createLLMClient(config: LLMConfig = {}): LLMClient {
  const provider = config.provider ?? process.env.LLM_PROVIDER ?? "mock";
  const model = config.model ?? (process.env.LLM_MODEL || undefined);

  switch (provider) {
    case "anthropic":
      return createAnthropicClient({ model });
    case "openai-compatible":
      return createOpenAICompatibleClient({ model });
    case "mock":
      return createMockClient();
    default:
      throw new Error(`unknown LLM_PROVIDER: "${provider}". Options: ${PROVIDERS.join(", ")}`);
  }
}
