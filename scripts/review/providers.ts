// Reviewer model call. Two formats cover most providers:
// - "openai-compatible": DeepSeek, OpenAI, OpenRouter, Groq, Ollama… (POST {baseUrl}/chat/completions)
// - "anthropic": Claude, through the official SDK.

import Anthropic from "@anthropic-ai/sdk";
import type { Tier, Usage } from "./lib.ts";

export interface ModelReply {
  text: string;
  usage: Usage;
  model: string;
  /** The backend configuration the provider reports, when it does ("openai-compatible" `system_fingerprint`). */
  fingerprint?: string;
}

/** Failure after the model was already billed: carries the usage so the report can show the cost. */
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
  system_fingerprint?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number; // DeepSeek
    prompt_tokens_details?: { cached_tokens?: number }; // OpenAI format
  };
}

async function callOpenAICompatible(
  tier: Tier,
  apiKey: string,
  prompt: { system: string; user: string },
  timeoutMs: number,
): Promise<ModelReply> {
  if (!tier.baseUrl) throw new Error("tier without a configured baseUrl");
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
      // Reasoning models spend part of this limit thinking before they answer.
      max_tokens: tier.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      ...tier.extraBody,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    // Only the status and the start of the message: never echo headers (they contain the key).
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`the provider answered HTTP ${response.status}: ${detail}`);
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
      `the model's reply was cut off at the limit of ${tier.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS} output tokens (raise maxOutputTokens in .github/review.json or split the PR)`,
      usage,
    );
  }
  if (!text.trim()) throw new ModelCallError(`empty reply from the model (finish_reason: ${choice?.finish_reason ?? "?"})`, usage);
  return { text, model: data.model ?? tier.model, usage, ...(data.system_fingerprint ? { fingerprint: data.system_fingerprint } : {}) };
}

async function callAnthropic(
  tier: Tier,
  apiKey: string,
  prompt: { system: string; user: string },
  timeoutMs: number,
): Promise<ModelReply> {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  // Streaming: the SDK requires it for large output limits (avoids a connection timeout).
  const stream = client.beta.messages.stream(
    {
      model: tier.model,
      max_tokens: tier.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      output_config: { effort: "high" },
      // If the model refuses due to a safety filter, the API tries another recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { timeout: timeoutMs },
  );
  const response = await stream.finalMessage();
  // At Anthropic, input_tokens already excludes what came from the cache; we add it up for the total input.
  const cacheRead = response.usage.cache_read_input_tokens ?? 0;
  const usage: Usage = {
    inputTokens: response.usage.input_tokens + cacheRead + (response.usage.cache_creation_input_tokens ?? 0),
    outputTokens: response.usage.output_tokens,
    cachedInputTokens: cacheRead,
  };
  if (response.stop_reason === "refusal") {
    throw new ModelCallError(`the model refused the review (${response.stop_details?.category ?? "no category"})`, usage);
  }
  if (response.stop_reason === "max_tokens") {
    throw new ModelCallError("the model's reply was cut off at the output token limit", usage);
  }
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { text, model: response.model, usage };
}

/**
 * The model the provider says is behind the tier's id, before any call: the `name` in `{baseUrl}/models`
 * ("openai-compatible", e.g. DeepSeek). Anthropic ids name one model, so the reply's `model` is checked instead.
 */
export async function listedVersion(tier: Tier, apiKey: string, timeoutMs: number): Promise<string> {
  if (tier.provider === "anthropic") return tier.model;
  if (!tier.baseUrl) throw new Error("tier without a configured baseUrl");
  const response = await fetch(`${tier.baseUrl.replace(/\/$/, "")}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`could not read the provider's model list (HTTP ${response.status})`);
  const data = (await response.json()) as { data?: Array<{ id?: string; name?: string }> };
  const entry = data.data?.find((m) => m.id === tier.model);
  if (!entry) throw new Error(`the provider no longer lists \`${tier.model}\``);
  return entry.name ?? entry.id ?? tier.model;
}

/** Why the model is not the pinned one, or null. `listed` comes from `listedVersion`; `replied` is the reply's `model`, when known. */
export function versionProblem(tier: Tier, listed: string, replied?: string): string | null {
  if (!tier.pinnedVersion) return null;
  const how = "Nothing was reviewed with it. Run the review canary with the new model, then update `pinnedVersion` in `.github/review.json` in a PR.";
  if (listed !== tier.pinnedVersion) {
    return `the provider now serves \`${listed}\` behind \`${tier.model}\`, not the pinned \`${tier.pinnedVersion}\`. ${how}`;
  }
  // A provider may answer with the dated id of the alias (`claude-x-1` → `claude-x-1-20260101`); any other model is not it,
  // a longer name or version included (`deepseek-v4-pro-max`, or `claude-x-1-5` for the pin `claude-x-1`).
  const expected = tier.provider === "anthropic" ? tier.pinnedVersion : tier.model;
  const same = (r: string) => r === expected || (r.startsWith(`${expected}-`) && /^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(r.slice(expected.length + 1)));
  if (replied !== undefined && !same(replied)) {
    return `the reply came from \`${replied}\`, not the pinned \`${expected}\` (an upstream redirect or fallback). Its findings were discarded. Run the review canary with that model before trusting it.`;
  }
  return null;
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
