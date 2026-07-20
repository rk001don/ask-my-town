// Server-only session helpers (HMAC-signed cookie for employee auth).
// This file's name ends with .server.ts so the client bundle can't pull it in.
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  getCookie,
  setCookie,
  deleteCookie,
} from "@tanstack/react-start/server";

const COOKIE_NAME = "mt_emp";
const MAX_AGE_SEC = 60 * 60 * 8; // 8 hours

function b64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4);
  const norm = (s + (pad < 4 ? "=".repeat(pad) : "")).replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(norm, "base64");
}

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

type Payload = { sub: string; name: string; exp: number };

export function signEmployeeSession(employeeId: string, name: string): string {
  const payload: Payload = {
    sub: employeeId,
    name,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", getSecret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyEmployeeSession(token: string): Payload | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = b64url(createHmac("sha256", getSecret()).update(body).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as Payload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setEmployeeCookie(employeeId: string, name: string) {
  setCookie(COOKIE_NAME, signEmployeeSession(employeeId, name), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export function clearEmployeeCookie() {
  deleteCookie(COOKIE_NAME, { path: "/" });
}

export function readEmployeeSession(): Payload | null {
  const raw = getCookie(COOKIE_NAME);
  if (!raw) return null;
  return verifyEmployeeSession(raw);
}
