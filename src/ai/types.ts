// Single contract for any LLM provider.
// The rest of the app only knows these types; changing provider = changing the adapter.

export interface LLMRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

export interface LLMResponse {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface LLMClient {
  readonly name: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

/** The provider refused to answer (e.g. safety filter). */
export class LLMRefusalError extends Error {}
