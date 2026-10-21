// Liga o nome de um "target" (em evals/config.json) à função do app que ele mede.
// Para avaliar uma nova função que usa LLM, adicione uma entrada aqui.

import { MAX_SUMMARY_CHARS, classifyMessage } from "../src/ai/classify-message.ts";
import type { LLMClient } from "../src/ai/llm.ts";

export interface TargetOutput {
  /** Rótulo comparado com `expected.category` do golden set. */
  label: string;
  /** Texto livre checado pelas regras e pelo juiz. */
  text: string;
  maxChars: number;
  needsHuman: boolean;
}

export type Target = (input: string, llm: LLMClient) => Promise<TargetOutput>;

export const TARGETS: Record<string, Target> = {
  async classifyMessage(input, llm) {
    const result = await classifyMessage(input, llm);
    return { label: result.category, text: result.summary, maxChars: MAX_SUMMARY_CHARS, needsHuman: result.needsHuman };
  },
};
