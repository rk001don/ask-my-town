export type ServiceFeeTiers = {
  tiers: Array<{ max_subtotal: number; fee: number }>;
  default_fee: number;
};

/**
 * Tiered flat service fee based on the estimated (priced-items-only) basket
 * subtotal -- first tier whose max_subtotal the subtotal falls at-or-under
 * wins; default_fee applies above the highest tier. Returns null when there's
 * no priced subtotal to base a fee on yet (e.g. an all "price on request"
 * basket) -- in that case the fee genuinely can't be estimated until pricing
 * is confirmed, and the UI should say so rather than show a number.
 */
export function computeServiceFee(subtotal: number, config: ServiceFeeTiers | null): number | null {
  if (!config || subtotal <= 0) return null;
  const sorted = [...config.tiers].sort((a, b) => a.max_subtotal - b.max_subtotal);
  for (const tier of sorted) {
    if (subtotal <= tier.max_subtotal) return tier.fee;
  }
  return config.default_fee;
}
