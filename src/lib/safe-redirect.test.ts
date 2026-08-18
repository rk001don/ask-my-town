import { describe, expect, it } from "vitest";
import { safeRedirect } from "./safe-redirect";

const ORIGIN = "https://askmytown.vercel.app";

describe("safeRedirect", () => {
  describe("refuses to leave our origin", () => {
    // This is the security case: the param reaches both navigate() and the
    // OAuth redirectTo, so anything that resolves off-origin is an open
    // redirect and must degrade to home rather than being followed.
    it.each([
      ["absolute foreign origin", "https://evil.example.com/x"],
      ["protocol-relative", "//evil.example.com/x"],
      ["protocol-relative, no path", "//evil.example.com"],
      ["backslash variant", "\\\\evil.example.com/x"],
      ["scheme injection", "javascript:alert(1)"],
      ["data url", "data:text/html,<script>alert(1)</script>"],
      ["origin lookalike", "https://askmytown.vercel.app.evil.com/x"],
    ])("%s -> /", (_label, raw) => {
      expect(safeRedirect(raw, ORIGIN)).toBe("/");
    });
  });

  describe("keeps legitimate destinations", () => {
    it("passes a same-origin path through", () => {
      expect(safeRedirect("/cart", ORIGIN)).toBe("/cart");
    });

    it("preserves query and hash", () => {
      expect(safeRedirect("/c/food?highlight=abc#top", ORIGIN)).toBe("/c/food?highlight=abc#top");
    });

    it("normalises a full same-origin href to a path", () => {
      // The authenticated-route guard passes location.href, which
      // navigate({to}) cannot resolve as-is.
      expect(safeRedirect(`${ORIGIN}/c/food`, ORIGIN)).toBe("/c/food");
    });
  });

  describe("degrades safely", () => {
    it.each([
      ["undefined", undefined],
      ["null", null],
      ["empty string", ""],
    ])("%s -> /", (_label, raw) => {
      expect(safeRedirect(raw, ORIGIN)).toBe("/");
    });

    it("never bounces back to the sign-in screen", () => {
      // Otherwise signing in from /auth returns you to /auth.
      expect(safeRedirect("/auth", ORIGIN)).toBe("/");
      expect(safeRedirect("/auth?mode=signup", ORIGIN)).toBe("/");
    });

    it("returns / when no origin is known (server render)", () => {
      expect(safeRedirect("/cart", "")).toBe("/");
    });
  });
});
