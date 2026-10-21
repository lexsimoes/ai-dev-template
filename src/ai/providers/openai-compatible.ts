// Adaptador para APIs no formato da OpenAI (POST {baseUrl}/chat/completions):
// DeepSeek, OpenAI, OpenRouter, Groq, Ollama…
// Configuração: LLM_BASE_URL, LLM_MODEL, LLM_API_KEY e, opcional, LLM_EXTRA_BODY (JSON).

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
  /** Campos extras do corpo da requisição, ex.: { "reasoning_effort": "low" }. */
  extraBody?: Record<string, unknown>;
  timeoutMs?: number;
}

export function createOpenAICompatibleClient(options: OpenAICompatibleOptions = {}): LLMClient {
  const baseUrl = options.baseUrl ?? process.env.LLM_BASE_URL;
  const model = options.model ?? process.env.LLM_MODEL;
  const apiKey = options.apiKey ?? process.env.LLM_API_KEY;
  if (!baseUrl) throw new Error("LLM_BASE_URL não definida (ex.: https://api.deepseek.com)");
  if (!model) throw new Error("LLM_MODEL não definido (ex.: deepseek-v4-pro)");
  if (!apiKey) throw new Error("LLM_API_KEY não definida");
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
        // Só o status e o começo da mensagem; nunca os cabeçalhos (que contêm a chave).
        throw new Error(`o provedor respondeu HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
      }
      const data = (await response.json()) as ChatCompletion;
      return {
        text: data.choices?.[0]?.message?.content ?? "",
        model: data.model ?? model,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      };
    },
  };
}
