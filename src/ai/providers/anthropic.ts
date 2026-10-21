// Adapter for the Anthropic API (Claude). Reads ANTHROPIC_API_KEY from the environment.

import Anthropic from "@anthropic-ai/sdk";
import { LLMRefusalError } from "../types.ts";
import type { LLMClient } from "../types.ts";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

export function createAnthropicClient(options: { model?: string } = {}): LLMClient {
  const client = new Anthropic();
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;

  return {
    name: `anthropic:${model}`,
    async complete(request) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: request.maxTokens ?? 1024,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        // Short tasks (classify, summarize) do not need long reasoning.
        output_config: { effort: "low" },
        // If the model refuses due to a safety filter, the API tries another recommended model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      if (response.stop_reason === "refusal") {
        throw new LLMRefusalError(response.stop_details?.explanation ?? "The model refused the request");
      }

      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");

      return {
        text,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      };
    },
  };
}
