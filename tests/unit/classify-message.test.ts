import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMessage, parseClassification } from "../../src/ai/classify-message.ts";
import { createMockClient } from "../../src/ai/providers/mock.ts";

test("aceita JSON válido do modelo", () => {
  const result = parseClassification('{"category": "entrega", "summary": "Pedido atrasado"}');
  assert.deepEqual(result, { category: "entrega", summary: "Pedido atrasado", needsHuman: false });
});

test("aceita JSON cercado por texto", () => {
  const result = parseClassification('Claro! {"category": "troca", "summary": "Quer trocar"} Obrigado.');
  assert.equal(result.category, "troca");
});

test("classifica com o provedor mock", async () => {
  const result = await classifyMessage("Meu boleto não foi compensado", createMockClient());
  assert.equal(result.category, "pagamento");
});
