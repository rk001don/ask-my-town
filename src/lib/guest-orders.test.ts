import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgetGuestOrder, pendingGuestOrders, rememberGuestOrder } from "./guest-orders";

const KEY = "mytown.guestOrders.v1";

describe("guest order store", () => {
  beforeEach(() => localStorage.clear());

  it("remembers an order placed as a guest", () => {
    rememberGuestOrder("MT-AAA111");
    expect(pendingGuestOrders()).toEqual(["MT-AAA111"]);
  });

  it("does not record the same order twice", () => {
    rememberGuestOrder("MT-AAA111");
    rememberGuestOrder("MT-BBB222");
    rememberGuestOrder("MT-AAA111");
    expect(pendingGuestOrders()).toEqual(["MT-BBB222", "MT-AAA111"]);
  });

  it("forgets one without disturbing the rest", () => {
    rememberGuestOrder("MT-AAA111");
    rememberGuestOrder("MT-BBB222");
    forgetGuestOrder("MT-AAA111");
    expect(pendingGuestOrders()).toEqual(["MT-BBB222"]);
  });

  it("drops entries older than 90 days", () => {
    // Otherwise a device accumulates claims forever and retries them on every
    // single sign-in.
    const day = 24 * 60 * 60 * 1000;
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: "MT-OLD999", at: Date.now() - 91 * day },
        { id: "MT-NEW111", at: Date.now() },
      ]),
    );
    expect(pendingGuestOrders()).toEqual(["MT-NEW111"]);
  });

  describe("degrades instead of throwing", () => {
    // Claiming is a convenience; "Add a past order" is always still there. A
    // throw here would break sign-in itself, which is not an acceptable price.
    it.each([
      ["corrupt json", "{not json"],
      ["wrong shape", '{"a":1}'],
      ["array of junk", "[1,2,3]"],
      ["null", "null"],
    ])("%s -> empty list", (_label, raw) => {
      localStorage.setItem(KEY, raw);
      expect(pendingGuestOrders()).toEqual([]);
    });

    it("survives localStorage being unavailable", () => {
      const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("SecurityError: storage disabled");
      });
      expect(() => pendingGuestOrders()).not.toThrow();
      expect(pendingGuestOrders()).toEqual([]);
      spy.mockRestore();
    });

    it("does not throw when a write fails", () => {
      const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });
      expect(() => rememberGuestOrder("MT-AAA111")).not.toThrow();
      spy.mockRestore();
    });
  });

  it("keeps the store bounded", () => {
    for (let i = 0; i < 40; i++) rememberGuestOrder(`MT-${i}`);
    expect(pendingGuestOrders().length).toBeLessThanOrEqual(20);
  });
});
