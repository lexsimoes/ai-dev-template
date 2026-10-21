// Fake provider, deterministic and free. Used to test the "plumbing"
// (tests, evals, CI) without an API key. It does NOT measure the quality of any real AI.

import type { LLMClient } from "../types.ts";

const KEYWORDS: Array<[string, string[]]> = [
  ["troca", ["troca", "trocar", "devolver", "devolução", "tamanho"]],
  ["entrega", ["entrega", "chegou", "rastreio", "atrasad", "transportadora"]],
  ["pagamento", ["pagamento", "boleto", "pix", "cartão", "cobrança", "cobrado"]],
];

export function createMockClient(): LLMClient {
  return {
    name: "mock",
    async complete(request) {
      // Only looks at the customer's text, which sits between the prompt tags.
      const match = /<mensagem_do_cliente>([\s\S]*)<\/mensagem_do_cliente>/.exec(request.user);
      const message = (match?.[1] ?? request.user).trim();
      const lower = message.toLowerCase();

      const category = KEYWORDS.find(([, words]) => words.some((w) => lower.includes(w)))?.[0] ?? "outro";
      const summary = `Mensagem do cliente sobre: ${category}.`;

      return { text: JSON.stringify({ category, summary }), model: "mock" };
    },
  };
}
