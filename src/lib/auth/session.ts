// Stateless HMAC-signed session cookie (Web Crypto, workerd-safe).
// Cookie value = base64url(payloadJson) + "." + base64url(HMAC-SHA256(payloadB64)).

export const COOKIE_NAME = "ml_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

interface SessionPayload {
  iat: number;
  exp: number;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) {
    bin += String.fromCharCode(b);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return b64ToBytes(b64 + pad);
}

async function importKey(hmacKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", b64ToBytes(hmacKeyB64), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(hmacKeyB64: string, now: Date = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: SessionPayload = { iat, exp: iat + SESSION_TTL_SECONDS };
  const payloadB64 = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importKey(hmacKeyB64);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${bytesToB64url(new Uint8Array(sig))}`;
}

export async function verifySession(hmacKeyB64: string, cookieValue: string, now: Date = new Date()): Promise<boolean> {
  try {
    const [payloadB64, sigB64] = cookieValue.split(".");
    if (!payloadB64 || !sigB64) {
      return false;
    }
    const key = await importKey(hmacKeyB64);
    const valid = await crypto.subtle.verify("HMAC", key, b64urlToBytes(sigB64), new TextEncoder().encode(payloadB64));
    if (!valid) {
      return false;
    }
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))) as SessionPayload;
    const nowSec = Math.floor(now.getTime() / 1000);
    return typeof payload.exp === "number" && payload.exp > nowSec;
  } catch {
    return false;
  }
}
