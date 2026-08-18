import { describe, expect, it } from "vitest";

import { formatOrderTimestamp, formatTimeRange12h, to12Hour } from "./time";

describe("to12Hour", () => {
  it("converts common hours", () => {
    expect(to12Hour("00:00")).toBe("12:00 AM");
    expect(to12Hour("09:30")).toBe("9:30 AM");
    expect(to12Hour("12:00")).toBe("12:00 PM");
    expect(to12Hour("15:00")).toBe("3:00 PM");
    expect(to12Hour("23:59")).toBe("11:59 PM");
  });

  it("passes through anything it can't parse", () => {
    expect(to12Hour("not-a-time")).toBe("not-a-time");
  });
});

describe("formatTimeRange12h", () => {
  it("joins two 24-hour strings into a 12-hour range", () => {
    expect(formatTimeRange12h("07:00", "11:00")).toBe("7:00 AM – 11:00 AM");
  });
});

describe("formatOrderTimestamp", () => {
  it("renders in 12-hour format, not 24-hour", () => {
    // 2026-08-17T09:15:00Z is 2:45 PM IST (UTC+5:30) -- picked specifically
    // so a bug that fell back to 24-hour or to the raw UTC hour would show a
    // different, wrong hour rather than coincidentally matching.
    const out = formatOrderTimestamp("2026-08-17T09:15:00Z");
    expect(out).toMatch(/\b(AM|PM)\b/);
    expect(out).toContain("2:45 PM");
  });

  it("is pinned to Asia/Kolkata regardless of the runtime's own timezone", () => {
    // 18:45 UTC is already past midnight in IST (UTC+5:30) -- 00:15 the next
    // calendar day. Wrong without an explicit timeZone: without it, a server
    // running in UTC would show 17 Aug, not 18 Aug.
    const out = formatOrderTimestamp("2026-08-17T18:45:00Z");
    expect(out).toContain("18 Aug");
    expect(out).toContain("12:15 AM");
  });

  it("never mentions the timezone by name", () => {
    // This app serves one Indian town -- the timezone is never ambiguous, so
    // it should never need spelling out on every timestamp.
    const out = formatOrderTimestamp("2026-08-17T09:15:00Z");
    expect(out).not.toMatch(/IST|GMT|UTC/i);
  });
});
