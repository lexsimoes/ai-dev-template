// Contrato único para qualquer provedor de LLM.
// O resto do app só conhece estes tipos; trocar de provedor = trocar o adaptador.

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

/** O provedor recusou responder (ex.: filtro de segurança). */
export class LLMRefusalError extends Error {}
