import { describe, expect, it } from "vitest";
import { catalogVisualFor, placeholderGradientFor } from "./catalog-display";

const iconName = (name: string, categoryIcon?: string) =>
  (catalogVisualFor(name, null, categoryIcon).Icon as unknown as { displayName?: string })
    .displayName;

describe("catalogVisualFor", () => {
  describe("substring collisions that were found by hand", () => {
    // Each of these matched the wrong rule before the table was reordered.
    // They are regression tests: the keyword list is substring-matched, so
    // adding an innocuous new keyword can silently break any of them.
    it.each([
      ["Chocolate Truffle Cake", "CakeSlice", '"cola" inside choCOLAte'],
      ["Kadai Chicken (Bowl)", "Drumstick", '"adai" inside kADAI'],
      ["Cotton Roll", "Bandage", 'bare "roll" read as bakery'],
      ["Bus Ticket Booking Help", "Bus", '"book" inside BOOKing'],
      ["Guest & Family Stay Booking", "Bed", '"family" read as parent help'],
      ["Chicken Puff (1 pc)", "Croissant", "bakery beats protein"],
    ])("%s -> %s (%s)", (product, expected) => {
      expect(iconName(product)).toBe(expected);
    });
  });

  describe("dish form is matched before protein", () => {
    it("reads a rice dish as a rice dish", () => {
      expect(iconName("Chicken Fried Rice (Plate)")).toBe("CookingPot");
    });

    it("still reaches the protein when there is no dish word", () => {
      expect(iconName("Chicken 65 (Plate)")).toBe("Drumstick");
    });
  });

  it("falls back to the category icon rather than an anonymous mark", () => {
    expect(iconName("Something We Have Never Sold", "utensils")).toBe("Utensils");
  });

  it("gives products meaningfully different icons", () => {
    // The bug this replaced was every product rendering one shared icon.
    const names = [
      "Idli (2 pcs)",
      "Chicken Biryani (Plate)",
      "Fish 65 (Plate)",
      "Mango Juice (300 ml)",
      "Paracetamol (Strip)",
      "Plumber Visit",
      "Bicycle Rental (Daily)",
      "Birth Certificate",
    ];
    expect(new Set(names.map((n) => iconName(n))).size).toBe(names.length);
  });
});

describe("placeholderGradientFor", () => {
  it("is stable for a name, so a dish keeps its colour across screens", () => {
    expect(placeholderGradientFor("Idli (2 pcs)")).toBe(placeholderGradientFor("Idli (2 pcs)"));
  });

  it("stays within the defined token range", () => {
    for (const n of ["a", "Idli", "Chicken Biryani (Plate)", "", "zzzzzzzzzz"]) {
      expect(placeholderGradientFor(n)).toMatch(/^var\(--ph-[0-7]\)$/);
    }
  });

  it("spreads names across the variants rather than clustering", () => {
    const names = Array.from({ length: 40 }, (_, i) => `Product ${i}`);
    expect(new Set(names.map(placeholderGradientFor)).size).toBeGreaterThan(4);
  });
});
