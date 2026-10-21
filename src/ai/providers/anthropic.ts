// Adaptador para a API da Anthropic (Claude). Lê ANTHROPIC_API_KEY do ambiente.

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
        // Tarefas curtas (classificar, resumir) não precisam de raciocínio longo.
        output_config: { effort: "low" },
        // Se o modelo recusar por filtro de segurança, a API tenta outro modelo recomendado.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      if (response.stop_reason === "refusal") {
        throw new LLMRefusalError(response.stop_details?.explanation ?? "O modelo recusou a solicitação");
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
