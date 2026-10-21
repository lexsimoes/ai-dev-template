import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCoupon } from "../../src/pricing.ts";

const now = new Date("2026-06-15T12:00:00Z");

test("sem cupom, total = subtotal", () => {
  assert.equal(applyCoupon(10_000, null, now), 10_000);
});

test("cupom de 10% em R$ 100,00 dá R$ 90,00", () => {
  assert.equal(applyCoupon(10_000, { code: "DEZ", percentOff: 10 }, now), 9_000);
});

test("cupom vence no fim do dia de validade", () => {
  const coupon = { code: "JUNHO", percentOff: 20, expiresAt: "2026-06-15" };
  assert.equal(applyCoupon(10_000, coupon, now), 8_000);
  assert.equal(applyCoupon(10_000, coupon, new Date("2026-06-16T00:00:01Z")), 10_000);
});

test("arredonda o desconto para o centavo mais próximo", () => {
  assert.equal(applyCoupon(999, { code: "X", percentOff: 15 }, now), 849);
});
