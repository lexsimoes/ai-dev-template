// Chamada ao modelo do revisor. Dois formatos cobrem a maioria dos provedores:
// - "openai-compatible": DeepSeek, OpenAI, OpenRouter, Groq, Ollama… (POST {baseUrl}/chat/completions)
// - "anthropic": Claude, pelo SDK oficial.

import Anthropic from "@anthropic-ai/sdk";
import type { Tier, Usage } from "./lib.ts";

export interface ModelReply {
  text: string;
  usage: Usage;
  model: string;
}

/** Falha depois que o modelo já foi cobrado: carrega o uso para o relatório mostrar o custo. */
export class ModelCallError extends Error {
  usage: Usage | null;
  constructor(message: string, usage: Usage | null) {
    super(message);
    this.usage = usage;
  }
}

const DEFAULT_MAX_OUTPUT_TOKENS = 16000;

interface ChatCompletion {
  model?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number; // DeepSeek
    prompt_tokens_details?: { cached_tokens?: number }; // formato OpenAI
  };
}

async function callOpenAICompatible(
  tier: Tier,
  apiKey: string,
  prompt: { system: string; user: string },
  timeoutMs: number,
): Promise<ModelReply> {
  if (!tier.baseUrl) throw new Error("nível sem baseUrl configurada");
  const response = await fetch(`${tier.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: tier.model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      response_format: { type: "json_object" },
      // Modelos com raciocínio gastam parte deste limite pensando antes de responder.
      max_tokens: tier.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      ...tier.extraBody,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    // Só o status e o início da mensagem: nunca ecoar cabeçalhos (que contêm a chave).
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`o provedor respondeu HTTP ${response.status}: ${detail}`);
  }
  const data = (await response.json()) as ChatCompletion;
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? "";
  const cached = data.usage?.prompt_cache_hit_tokens ?? data.usage?.prompt_tokens_details?.cached_tokens;
  const usage: Usage = {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    ...(cached !== undefined ? { cachedInputTokens: cached } : {}),
  };
  if (choice?.finish_reason === "length") {
    throw new ModelCallError(
      `a resposta do modelo foi cortada no limite de ${tier.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS} tokens de saída (aumente maxOutputTokens em .github/review.json ou divida o PR)`,
      usage,
    );
  }
  if (!text.trim()) throw new ModelCallError(`resposta vazia do modelo (finish_reason: ${choice?.finish_reason ?? "?"})`, usage);
  return { text, model: data.model ?? tier.model, usage };
}

async function callAnthropic(
  tier: Tier,
  apiKey: string,
  prompt: { system: string; user: string },
  timeoutMs: number,
): Promise<ModelReply> {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  // Streaming: o SDK exige para limites de saída grandes (evita timeout da conexão).
  const stream = client.beta.messages.stream(
    {
      model: tier.model,
      max_tokens: tier.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      output_config: { effort: "high" },
      // Se o modelo recusar por filtro de segurança, a API tenta outro modelo recomendado.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { timeout: timeoutMs },
  );
  const response = await stream.finalMessage();
  // Na Anthropic, input_tokens já exclui o que veio do cache; somamos para o total de entrada.
  const cacheRead = response.usage.cache_read_input_tokens ?? 0;
  const usage: Usage = {
    inputTokens: response.usage.input_tokens + cacheRead + (response.usage.cache_creation_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
    cachedInputTokens: cacheRead,
  };
  if (response.stop_reason === "refusal") {
    throw new ModelCallError(`o modelo recusou a revisão (${response.stop_details?.category ?? "sem categoria"})`, usage);
  }
  if (response.stop_reason === "max_tokens") {
    throw new ModelCallError("a resposta do modelo foi cortada no limite de tokens de saída", usage);
  }
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { text, model: response.model, usage };
}

export async function callModel(
  tier: Tier,
  apiKey: string,
  prompt: { system: string; user: string },
  timeoutMs: number,
): Promise<ModelReply> {
  return tier.provider === "anthropic"
    ? callAnthropic(tier, apiKey, prompt, timeoutMs)
    : callOpenAICompatible(tier, apiKey, prompt, timeoutMs);
}
