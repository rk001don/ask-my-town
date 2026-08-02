// Minimal Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) implementation built
// on WebCrypto + fetch only. The npm `web-push` package relies on Node's
// `https` module and native crypto, which is not available in the edge/Worker
// runtime this app's server functions run in.

const enc = new TextEncoder();

function b64urlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hkdf(
  ikm: Uint8Array | ArrayBuffer,
  salt: Uint8Array,
  info: Uint8Array,
  lengthBits: number,
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    lengthBits,
  );
}

/** Builds the `Authorization: vapid t=..., k=...` header for one push origin. */
async function vapidAuthHeader(
  audience: string,
  subject: string,
  publicKey: string,
  privateKey: string,
): Promise<string> {
  const pub = b64urlToBytes(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) {
    throw new Error("VAPID_PUBLIC_KEY must be an uncompressed P-256 point (65 bytes).");
  }
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: privateKey.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    ext: true,
  };
  const signingKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signingKey,
    enc.encode(signingInput),
  );
  const jwt = `${signingInput}.${bytesToB64url(new Uint8Array(sig))}`;
  return `vapid t=${jwt}, k=${bytesToB64url(pub)}`;
}

/** Encrypts a payload for one subscription using aes128gcm (RFC 8188/8291). */
async function encryptPayload(
  payload: string,
  uaPublicKey: string,
  authSecret: string,
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(uaPublicKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const localPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: uaKey },
    local.privateKey,
    256,
  );

  // PRK: HKDF over the ECDH secret, salted with the subscription auth secret.
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, localPublic);
  const prk = await hkdf(ecdhSecret, b64urlToBytes(authSecret), keyInfo, 256);

  const cekBits = await hkdf(prk, salt, enc.encode("Content-Encoding: aes128gcm\0"), 128);
  const nonceBits = await hkdf(prk, salt, enc.encode("Content-Encoding: nonce\0"), 96);

  const cek = await crypto.subtle.importKey("raw", cekBits, { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  // Single record: plaintext with the 0x02 (last record) delimiter appended.
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: new Uint8Array(nonceBits) },
      cek,
      plaintext as BufferSource,
    ),
  );

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([localPublic.length]), localPublic, ciphertext);
}

export type WebPushResult = { ok: true } | { ok: false; statusCode: number; message: string };

export async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapid: { publicKey: string; privateKey: string; subject: string },
  ttlSeconds = 24 * 60 * 60,
): Promise<WebPushResult> {
  const audience = new URL(subscription.endpoint).origin;
  const [authorization, body] = await Promise.all([
    vapidAuthHeader(audience, vapid.subject, vapid.publicKey, vapid.privateKey),
    encryptPayload(payload, subscription.keys.p256dh, subscription.keys.auth),
  ]);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
    },
    body: body as BodyInit,
  });

  if (res.ok) return { ok: true };
  return { ok: false, statusCode: res.status, message: await res.text().catch(() => "") };
}
