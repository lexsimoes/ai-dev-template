// ⛔ INVARIANT INV-001 — PROTECTED FILE.
// No agent may edit, skip (.skip/.todo) or weaken this test.
// Need to change it? STOP and ask the project owner. See tests/invariants/README.md.
//
// Rule (specs/PRD.md): the order total is never negative nor greater than the subtotal,
// and a coupon with a discount outside 0–100% is rejected, never applied.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCoupon } from "../../src/pricing.ts";

// Pseudo-random generator with a fixed seed: the same cases on every run.
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

test("INV-001a: 0 <= total <= subtotal for any valid coupon", () => {
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
    assert.ok(Number.isSafeInteger(total), `total is not an integer: ${subtotal} @ ${percentOff}%`);
    assert.ok(total >= 0, `negative total: ${subtotal} @ ${percentOff}% => ${total}`);
    assert.ok(total <= subtotal, `total greater than subtotal: ${subtotal} @ ${percentOff}% => ${total}`);
  }
});

test("INV-001b: a coupon outside 0–100% is rejected", () => {
  for (const percentOff of [-0.01, -50, 100.01, 150, 1e9, Number.NaN, Infinity, -Infinity]) {
    assert.throws(() => applyCoupon(10_000, { code: "RUIM", percentOff }, now), RangeError, `accepted ${percentOff}%`);
  }
});

test("INV-001c: an invalid subtotal is rejected", () => {
  for (const subtotal of [-1, 0.5, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 2]) {
    assert.throws(() => applyCoupon(subtotal, null, now), RangeError, `accepted subtotal ${subtotal}`);
  }
});
