import { describe, expect, it } from "vitest";
import { displayIndianPhone, isValidIndianPhone, normalizeIndianPhone } from "./phone";

describe("normalizeIndianPhone", () => {
  // The stored form is bare 10 digits. A number that sometimes carries +91 and
  // sometimes doesn't would silently fail to match on lookup, which is how an
  // order goes missing.
  it.each([
    ["bare", "9876543210"],
    ["with +91", "+919876543210"],
    ["with 91", "919876543210"],
    ["leading zero", "09876543210"],
    ["spaced", "98765 43210"],
    ["+91 and spaces", "+91 98765 43210"],
    ["dashed", "98765-43210"],
  ])("%s -> 9876543210", (_label, raw) => {
    expect(normalizeIndianPhone(raw)).toBe("9876543210");
  });
});

describe("isValidIndianPhone", () => {
  it.each([["9876543210"], ["+91 98765 43210"], ["6123456789"]])("accepts %s", (raw) => {
    expect(isValidIndianPhone(raw)).toBe(true);
  });

  it.each([
    ["too short", "98765432"],
    ["too long", "98765432101"],
    ["starts below the mobile range", "5876543210"],
    ["letters", "98765abcde"],
    ["empty", ""],
  ])("rejects %s", (_label, raw) => {
    expect(isValidIndianPhone(raw)).toBe(false);
  });
});

describe("displayIndianPhone", () => {
  it("formats a valid number for reading", () => {
    expect(displayIndianPhone("9876543210")).toBe("+91 98765 43210");
  });

  it("returns the input untouched when it isn't a valid number", () => {
    // Better to show what we hold than to format nonsense into something that
    // looks authoritative.
    expect(displayIndianPhone("12345")).toBe("12345");
  });
});
