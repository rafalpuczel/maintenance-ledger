import bcrypt from "bcryptjs";

// Constant-time string compare so username matching doesn't leak via timing.
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

// Verifies the shared credential pair. bcrypt.compare runs regardless of the
// username outcome to keep timing uniform; the result is a single generic boolean.
export async function verifyCredentials(
  username: string,
  password: string,
  expectedUsername: string,
  passwordHash: string,
): Promise<boolean> {
  const userMatch = timingSafeEqual(username, expectedUsername);
  const passMatch = await bcrypt.compare(password, passwordHash);
  return userMatch && passMatch;
}
