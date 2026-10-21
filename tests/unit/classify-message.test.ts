import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMessage, parseClassification } from "../../src/ai/classify-message.ts";
import { createMockClient } from "../../src/ai/providers/mock.ts";

test("accepts valid JSON from the model", () => {
  const result = parseClassification('{"category": "entrega", "summary": "Pedido atrasado"}');
  assert.deepEqual(result, { category: "entrega", summary: "Pedido atrasado", needsHuman: false });
});

test("accepts JSON surrounded by text", () => {
  const result = parseClassification('Claro! {"category": "troca", "summary": "Quer trocar"} Obrigado.');
  assert.equal(result.category, "troca");
});

test("classifies with the mock provider", async () => {
  const result = await classifyMessage("Meu boleto não foi compensado", createMockClient());
  assert.equal(result.category, "pagamento");
});
