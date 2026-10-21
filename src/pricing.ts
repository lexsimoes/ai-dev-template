// Exemplo de regra de negócio protegida por invariante (INV-001).
// Valores sempre em centavos (inteiros) para evitar erro de arredondamento.

export interface Coupon {
  code: string;
  percentOff: number;
  /** Data ISO (AAAA-MM-DD). Depois desse dia o cupom não vale. */
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
 * Aplica um cupom ao subtotal e devolve o total em centavos.
 * Entradas inválidas geram erro; nunca devolvemos um total "estranho".
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
