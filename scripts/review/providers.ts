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

interface ChatCompletion {
  model?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
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
      max_tokens: 16000,
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
  if (!text.trim()) throw new Error(`resposta vazia do modelo (finish_reason: ${choice?.finish_reason ?? "?"})`);
  return {
    text,
    model: data.model ?? tier.model,
    usage: { inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 },
  };
}

async function callAnthropic(
  tier: Tier,
  apiKey: string,
  prompt: { system: string; user: string },
  timeoutMs: number,
): Promise<ModelReply> {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  const response = await client.beta.messages.create(
    {
      model: tier.model,
      max_tokens: 16000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      output_config: { effort: "high" },
      // Se o modelo recusar por filtro de segurança, a API tenta outro modelo recomendado.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { timeout: timeoutMs },
  );
  if (response.stop_reason === "refusal") {
    throw new Error(`o modelo recusou a revisão (${response.stop_details?.category ?? "sem categoria"})`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("a resposta do modelo foi cortada (max_tokens)");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return {
    text,
    model: response.model,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
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
