// Escolhe o adaptador de LLM pela configuração (LLM_PROVIDER / LLM_MODEL).

import { createAnthropicClient } from "./providers/anthropic.ts";
import { createMockClient } from "./providers/mock.ts";
import type { LLMClient } from "./types.ts";

export type { LLMClient, LLMRequest, LLMResponse } from "./types.ts";
export { LLMRefusalError } from "./types.ts";

export const PROVIDERS = ["anthropic", "mock"] as const;

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
    case "mock":
      return createMockClient();
    default:
      throw new Error(`LLM_PROVIDER desconhecido: "${provider}". Opções: ${PROVIDERS.join(", ")}`);
  }
}
