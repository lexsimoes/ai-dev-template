import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyMessage, parseClassification } from "../../src/ai/classify-message.ts";
import { createMockClient } from "../../src/ai/providers/mock.ts";

test("accepts valid JSON from the model", () => {
  const result = parseClassification('{"category": "delivery", "summary": "Late order"}');
  assert.deepEqual(result, { category: "delivery", summary: "Late order", needsHuman: false });
});

test("accepts JSON surrounded by text", () => {
  const result = parseClassification('Sure! {"category": "exchange", "summary": "Wants to exchange"} Thanks.');
  assert.equal(result.category, "exchange");
});

test("classifies with the mock provider", async () => {
  const result = await classifyMessage("My invoice was paid but the order still says pending", createMockClient());
  assert.equal(result.category, "payment");
});
