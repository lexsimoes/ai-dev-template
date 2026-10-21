// Fake provider, deterministic and free. Used to test the "plumbing"
// (tests, evals, CI) without an API key. It does NOT measure the quality of any real AI.

import type { LLMClient } from "../types.ts";

const KEYWORDS: Array<[string, string[]]> = [
  ["exchange", ["exchange", "return", "refund", "size", "defect"]],
  ["delivery", ["delivery", "deliver", "arrived", "tracking", "late", "carrier", "package"]],
  ["payment", ["payment", "paid", "charged", "card", "invoice", "billing"]],
];

export function createMockClient(): LLMClient {
  return {
    name: "mock",
    async complete(request) {
      // Only looks at the customer's text, which sits between the prompt tags.
      const match = /<customer_message>([\s\S]*)<\/customer_message>/.exec(request.user);
      const message = (match?.[1] ?? request.user).trim();
      const lower = message.toLowerCase();

      const category = KEYWORDS.find(([, words]) => words.some((w) => lower.includes(w)))?.[0] ?? "other";
      const summary = `Customer message about: ${category}.`;

      return { text: JSON.stringify({ category, summary }), model: "mock" };
    },
  };
}
