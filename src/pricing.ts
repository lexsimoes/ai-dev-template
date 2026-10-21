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
    throw new RangeError(`Invalid expiry date on coupon ${coupon.code}`);
  }
  return now.getTime() <= end.getTime();
}

/**
 * Applies a coupon to the subtotal and returns the total in cents.
 * Invalid inputs throw an error; we never return a "weird" total.
 */
export function applyCoupon(subtotalCents: number, coupon: Coupon | null, now: Date = new Date()): number {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
    throw new RangeError("Subtotal must be an integer number of cents >= 0");
  }
  if (coupon === null) return subtotalCents;

  if (!Number.isFinite(coupon.percentOff) || coupon.percentOff < 0 || coupon.percentOff > 100) {
    throw new RangeError(`Coupon ${coupon.code}: the discount must be between 0 and 100%`);
  }
  if (!isCouponActive(coupon, now)) return subtotalCents;

  const discount = Math.round((subtotalCents * coupon.percentOff) / 100);
  return subtotalCents - discount;
}
