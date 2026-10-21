// Adapter for APIs in the OpenAI format (POST {baseUrl}/chat/completions):
// DeepSeek, OpenAI, OpenRouter, Groq, Ollama…
// Config: LLM_BASE_URL, LLM_MODEL, LLM_API_KEY and, optionally, LLM_EXTRA_BODY (JSON).

import type { LLMClient } from "../types.ts";

interface ChatCompletion {
  model?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface OpenAICompatibleOptions {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  /** Extra fields for the request body, e.g. { "reasoning_effort": "low" }. */
  extraBody?: Record<string, unknown>;
  timeoutMs?: number;
}

export function createOpenAICompatibleClient(options: OpenAICompatibleOptions = {}): LLMClient {
  const baseUrl = options.baseUrl ?? process.env.LLM_BASE_URL;
  const model = options.model ?? process.env.LLM_MODEL;
  const apiKey = options.apiKey ?? process.env.LLM_API_KEY;
  if (!baseUrl) throw new Error("LLM_BASE_URL is not set (e.g. https://api.deepseek.com)");
  if (!model) throw new Error("LLM_MODEL is not set (e.g. deepseek-v4-pro)");
  if (!apiKey) throw new Error("LLM_API_KEY is not set");
  const extraBody = options.extraBody ?? (process.env.LLM_EXTRA_BODY ? (JSON.parse(process.env.LLM_EXTRA_BODY) as Record<string, unknown>) : {});

  return {
    name: `openai-compatible:${model}`,
    async complete(request) {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          max_tokens: request.maxTokens ?? 1024,
          ...extraBody,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
      });
      if (!response.ok) {
        // Only the status and the start of the message; never the headers (they contain the key).
        throw new Error(`the provider answered HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      }
      const data = (await response.json()) as ChatCompletion;
      const choice = data.choices?.[0];
      // A cut or empty reply is a provider failure, not an output to interpret.
      if (choice?.finish_reason === "length") throw new Error("the reply went over the output token limit (finish_reason: length)");
      if (typeof choice?.message?.content !== "string" || !choice.message.content.trim()) {
        throw new Error(`the provider returned no text (finish_reason: ${choice?.finish_reason ?? "?"})`);
      }
      return {
        text: choice.message.content,
        model: data.model ?? model,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      };
    },
  };
}
