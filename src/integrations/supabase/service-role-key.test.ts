import { describe, expect, it } from "vitest";

import { describeServiceRoleKeyProblem, serviceRoleKeyWarning } from "./service-role-key";

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.signature`;
}

describe("describeServiceRoleKeyProblem", () => {
  it("spots a publishable key", () => {
    // The bug this exists for: a publishable key in the service-role slot
    // builds a working client that quietly answers as anon.
    expect(describeServiceRoleKeyProblem("sb_publishable_abc123")).toBe("a publishable key");
  });

  it("spots a legacy anon JWT", () => {
    expect(describeServiceRoleKeyProblem(jwt({ role: "anon", iss: "supabase" }))).toBe(
      "an anon key",
    );
  });

  it("passes a secret key", () => {
    expect(describeServiceRoleKeyProblem("sb_secret_abc123")).toBeUndefined();
  });

  it("passes a legacy service-role JWT", () => {
    expect(describeServiceRoleKeyProblem(jwt({ role: "service_role" }))).toBeUndefined();
  });

  it("stays quiet about anything it cannot classify", () => {
    // Only report where we are certain. Crying wolf about an unfamiliar key
    // format would train people to ignore this message.
    expect(describeServiceRoleKeyProblem("some-future-format")).toBeUndefined();
    expect(describeServiceRoleKeyProblem("a.b.c")).toBeUndefined();
    expect(describeServiceRoleKeyProblem(jwt({ sub: "no-role-claim" }))).toBeUndefined();
  });
});

describe("serviceRoleKeyWarning", () => {
  it("names the symptom people will actually see, and the fix", () => {
    const message = serviceRoleKeyWarning("a publishable key");
    expect(message).toContain("mytown_check_rate_limit");
    expect(message).toContain("sb_secret_");
  });
});
