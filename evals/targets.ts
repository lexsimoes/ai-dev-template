// Links a "target" name (in evals/config.json) to the app function it measures.
// To evaluate a new function that uses an LLM, add an entry here.

import { MAX_SUMMARY_CHARS, classifyMessage } from "../src/ai/classify-message.ts";
import type { LLMClient } from "../src/ai/llm.ts";

export interface TargetOutput {
  /** Label compared with `expected.category` from the golden set. */
  label: string;
  /** Free text checked by the rules and the judge. */
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
