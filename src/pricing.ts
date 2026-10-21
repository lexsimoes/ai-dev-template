// Example of a business rule protected by an invariant (INV-001).
// Values are always in cents (integers) to avoid rounding errors.

export interface Coupon {
  code: string;
  percentOff: number;
  /** ISO date (YYYY-MM-DD). After this day the coupon is no longer valid. */
  expiresAt?: string;
}

export function isCouponActive(coupon: Coupon, now: Date): boolean {
  if (!coupon.expiresAt) return true;
  const end = new Date(`${coupon.expiresAt}T23:59:59.999Z`);
  if (Number.isNaN(end.getTime())) {
    throw new RangeError(`Data de validade inválida no cupom ${coupon.code}`);
  }
  return now.getTime() <= end.getTime();
}

/**
 * Applies a coupon to the subtotal and returns the total in cents.
 * Invalid inputs throw an error; we never return a "weird" total.
 */
export function applyCoupon(subtotalCents: number, coupon: Coupon | null, now: Date = new Date()): number {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
    throw new RangeError("Subtotal deve ser um inteiro de centavos >= 0");
  }
  if (coupon === null) return subtotalCents;

  if (!Number.isFinite(coupon.percentOff) || coupon.percentOff < 0 || coupon.percentOff > 100) {
    throw new RangeError(`Cupom ${coupon.code}: desconto deve estar entre 0 e 100%`);
  }
  if (!isCouponActive(coupon, now)) return subtotalCents;

  const discount = Math.round((subtotalCents * coupon.percentOff) / 100);
  return subtotalCents - discount;
}
