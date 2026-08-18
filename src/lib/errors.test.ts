import { describe, expect, it, vi } from "vitest";
import { failFrom, isUserError, parseOrUserError, toUserMessage, userError } from "./errors";

const FALLBACK = "Something went wrong. Please try again.";

describe("error allowlist", () => {
  // The whole point of this module is that a message reaches a customer ONLY
  // if a human wrote it for one. These tests are the guard on that promise:
  // the failure mode it prevents is raw Postgres text in a toast.
  describe("never shows text nobody wrote for a person", () => {
    it.each([
      ["raw postgres", new Error('duplicate key value violates unique constraint "orders_pkey"')],
      ["postgrest", new Error("failed to parse logic tree ((status.eq.received))")],
      ["permission", new Error("permission denied for function mytown_check_rate_limit")],
      ["connection string", new Error("connect ECONNREFUSED 10.0.0.5:5432")],
      ["plain string throw", "boom"],
      ["null", null],
      ["undefined", undefined],
      ["object", { code: "42501", message: "permission denied" }],
    ])("%s collapses to the fallback", (_label, thrown) => {
      expect(toUserMessage(thrown, FALLBACK)).toBe(FALLBACK);
    });
  });

  it("shows a message that was written for a person", () => {
    const e = userError("You can order up to 50 of one item.");
    expect(toUserMessage(e, FALLBACK)).toBe("You can order up to 50 of one item.");
    expect(isUserError(e)).toBe(true);
  });

  it("does not treat an ordinary error as user-facing", () => {
    expect(isUserError(new Error("permission denied"))).toBe(false);
  });

  it("strips the marker so it can never reach the screen", () => {
    expect(toUserMessage(userError("Try again in a minute."), FALLBACK)).not.toContain("MTUSER");
  });

  it("refuses a message that merely looks like the marker", () => {
    // Fail-closed: text that happens to begin with the literal marker -- echoed
    // user input, or a library that formats errors that way -- must not be able
    // to promote itself to customer-facing. This is why the real marker carries
    // an untypable codepoint rather than being a plain ASCII prefix.
    expect(toUserMessage(new Error("MTUSER: fake"), FALLBACK)).toBe(FALLBACK);
    expect(toUserMessage(new Error("MTUSER:fake"), FALLBACK)).toBe(FALLBACK);
    expect(isUserError(new Error("MTUSER: fake"))).toBe(false);
  });

  describe("failFrom", () => {
    it("logs the real cause and throws only the safe line", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(() =>
        failFrom(
          "createOrder.insert",
          { code: "23505", message: "duplicate key" },
          "Please retry.",
        ),
      ).toThrow("Please retry.");
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("23505"));
      expect(spy.mock.calls[0][0]).toContain("createOrder.insert");
      spy.mockRestore();
    });

    it("what it throws is safe to display", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        failFrom("ctx", new Error("permission denied for table orders"), "Please retry.");
      } catch (err) {
        expect(toUserMessage(err, FALLBACK)).toBe("Please retry.");
        expect(toUserMessage(err, FALLBACK)).not.toContain("permission");
      }
      spy.mockRestore();
    });
  });

  describe("parseOrUserError", () => {
    const schema = {
      parse: () => {
        throw { issues: [{ message: "You can order up to 50 of one item." }] };
      },
    };

    it("surfaces the schema's own message", () => {
      // Without this a ZodError is unmarked, so a carefully written rule was
      // collapsed to the generic fallback and never reached anyone.
      expect(() => parseOrUserError(schema, {})).toThrow("You can order up to 50 of one item.");
    });

    it("falls back when the schema gives nothing readable", () => {
      const bare = {
        parse: () => {
          throw new Error("nope");
        },
      };
      expect(() => parseOrUserError(bare, {}, "Check the details.")).toThrow("Check the details.");
    });

    it("returns the parsed value when valid", () => {
      expect(parseOrUserError({ parse: (d: unknown) => d as { a: number } }, { a: 1 })).toEqual({
        a: 1,
      });
    });
  });
});
