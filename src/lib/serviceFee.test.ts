import { describe, expect, it } from "vitest";
import { computeServiceFee, getOrderTotals, type ServiceFeeTiers } from "./serviceFee";

const CONFIG: ServiceFeeTiers = {
  tiers: [
    { max_subtotal: 100, fee: 19 },
    { max_subtotal: 300, fee: 29 },
  ],
  default_fee: 49,
};

describe("computeServiceFee", () => {
  it.each([
    ["under the first tier", 50, 19],
    ["exactly on a tier boundary", 100, 19],
    ["one past a boundary", 101, 29],
    ["on the second boundary", 300, 29],
    ["above every tier", 301, 49],
  ])("%s: %i -> %i", (_label, subtotal, expected) => {
    expect(computeServiceFee(subtotal, CONFIG)).toBe(expected);
  });

  it("returns null when there is nothing priced to base a fee on", () => {
    // An all "price on request" basket genuinely can't be quoted yet, and the
    // UI must say so rather than print a number that looks committed.
    expect(computeServiceFee(0, CONFIG)).toBeNull();
    expect(computeServiceFee(-5, CONFIG)).toBeNull();
  });

  it("returns null with no config rather than guessing a fee", () => {
    expect(computeServiceFee(150, null)).toBeNull();
  });

  it("does not depend on the tiers being given in order", () => {
    const shuffled: ServiceFeeTiers = { ...CONFIG, tiers: [...CONFIG.tiers].reverse() };
    expect(computeServiceFee(50, shuffled)).toBe(19);
  });
});

describe("getOrderTotals", () => {
  it("multiplies by quantity and adds the fee", () => {
    const t = getOrderTotals([{ unit_price: 15, quantity: 2 }], 19);
    expect(t.subtotal).toBe(30);
    expect(t.total).toBe(49);
  });

  it("ignores unpriced items in the subtotal", () => {
    // "Price on request" lines must not silently count as ₹0 towards a tier.
    const t = getOrderTotals(
      [
        { unit_price: 15, quantity: 1 },
        { unit_price: null, quantity: 3 },
      ],
      19,
    );
    expect(t.subtotal).toBe(15);
  });

  it("treats a missing quantity as one", () => {
    expect(getOrderTotals([{ unit_price: 40 }], 0).subtotal).toBe(40);
  });
});
