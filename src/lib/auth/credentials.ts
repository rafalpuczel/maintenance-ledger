// Verifies the shared credential pair with a peppered HMAC of the password
// (Web Crypto, workerd-native, sub-millisecond). bcrypt is intentionally NOT
// used: it is pure-JS and CPU-bound (~100ms at cost 12), which exceeds the
// Workers free-tier 10ms CPU/request limit and gets the login request killed.
// A slow KDF buys little here — the credential is a single deploy secret, not a
// user-table dump — and online guessing is defended by the per-IP KV throttle.
// Stored hash = base64url(HMAC-SHA256(password, pepper)).

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

// Constant-time string compare so neither field leaks via timing.
function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let mismatch = aBytes.length ^ bBytes.length;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i++) {
    mismatch |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return mismatch === 0;
}

// Base64url HMAC-SHA256 of the password under the base64 pepper. Exported so a
// provisioning script can mint SHARED_PASSWORD_HASH with the exact same codec.
export async function hashPassword(password: string, pepperB64: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", b64ToBytes(pepperB64), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(password));
  return bytesToB64url(new Uint8Array(sig));
}

// The password HMAC is computed regardless of username match to keep timing
// uniform; the result is a single generic boolean.
export async function verifyCredentials(
  username: string,
  password: string,
  expectedUsername: string,
  passwordHash: string,
  pepperB64: string,
): Promise<boolean> {
  const userMatch = timingSafeEqual(username, expectedUsername);
  const computed = await hashPassword(password, pepperB64);
  const passMatch = timingSafeEqual(computed, passwordHash);
  return userMatch && passMatch;
}
