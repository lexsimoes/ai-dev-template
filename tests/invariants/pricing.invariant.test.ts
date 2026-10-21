// ⛔ INVARIANTE INV-001 — ARQUIVO PROTEGIDO.
// Nenhum agente pode editar, pular (.skip/.todo) ou enfraquecer este teste.
// Precisa mudar? PARE e pergunte ao dono do projeto. Veja tests/invariants/README.md.
//
// Regra (specs/PRD.md): o total do pedido nunca é negativo nem maior que o subtotal,
// e um cupom com desconto fora de 0–100% é recusado, nunca aplicado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCoupon } from "../../src/pricing.ts";

// Gerador pseudoaleatório com semente fixa: os mesmos casos em toda execução.
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const now = new Date("2026-06-15T12:00:00Z");

test("INV-001a: 0 <= total <= subtotal para qualquer cupom válido", () => {
  const rand = seeded(20260615);
  const edgeSubtotals = [0, 1, 2, 99, 100, 101, 999_999_99, Number.MAX_SAFE_INTEGER];
  const edgePercents = [0, 0.01, 0.5, 33.33, 49.999, 50, 99.99, 100];

  const cases: Array<[number, number]> = [];
  for (const s of edgeSubtotals) for (const p of edgePercents) cases.push([s, p]);
  for (let i = 0; i < 10_000; i++) {
    cases.push([Math.floor(rand() * 10_000_000), Math.round(rand() * 10_000) / 100]);
  }

  for (const [subtotal, percentOff] of cases) {
    const total = applyCoupon(subtotal, { code: "INV", percentOff }, now);
    assert.ok(Number.isSafeInteger(total), `total não inteiro: ${subtotal} @ ${percentOff}%`);
    assert.ok(total >= 0, `total negativo: ${subtotal} @ ${percentOff}% => ${total}`);
    assert.ok(total <= subtotal, `total maior que subtotal: ${subtotal} @ ${percentOff}% => ${total}`);
  }
});

test("INV-001b: cupom fora de 0–100% é recusado", () => {
  for (const percentOff of [-0.01, -50, 100.01, 150, 1e9, Number.NaN, Infinity, -Infinity]) {
    assert.throws(() => applyCoupon(10_000, { code: "RUIM", percentOff }, now), RangeError, `aceitou ${percentOff}%`);
  }
});

test("INV-001c: subtotal inválido é recusado", () => {
  for (const subtotal of [-1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 2]) {
    assert.throws(() => applyCoupon(subtotal, null, now), RangeError, `aceitou subtotal ${subtotal}`);
  }
});
