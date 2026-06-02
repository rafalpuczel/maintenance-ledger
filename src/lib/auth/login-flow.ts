// Decision seam for the login route. Lifts the throttle + credential
// orchestration out of src/pages/api/auth/login.ts so it is testable under
// plain-Node Vitest — the route still owns the env/secret reads, the cookie
// signing, and the redirect/Response mechanics, and passes its dependencies in.
//
// Load-bearing ordering (must match the route's original flow exactly):
//   1. delay decided BEFORE the credential check
//   2. null IP  =>  MAX_DELAY_MS against the "untrusted" bucket (never a client header)
//   3. recordFailure on reject; clearFailures on accept
//
// Imports are relative siblings (no astro:*/cloudflare:* virtual modules) so this
// module stays Vitest-collectable — see context/foundation/lessons.md (S-06).
import { verifyCredentials } from "./credentials";
import { currentDelay, recordFailure, clearFailures, MAX_DELAY_MS, type KVLike } from "./throttle";

export interface LoginCreds {
  expectedUsername: string;
  passwordHash: string;
  pepper: string;
}

export interface DecideLoginInput {
  kv: KVLike;
  ip: string | null;
  username: string;
  password: string;
  creds: LoginCreds;
  // Injected so the throttle delay is applied without a real wall-clock wait
  // under test; the route passes a setTimeout-backed sleep.
  sleep: (ms: number) => Promise<void>;
}

export type LoginDecision = { outcome: "accept" } | { outcome: "reject" };

// Applies the throttle delay, verifies the shared credential, and records or
// clears the failure counter — returning only the terminal outcome the route
// must render. The bucket key, the delay value, and which counter call fires are
// all decided here; the route just maps the outcome to a redirect/cookie.
export async function decideLogin(input: DecideLoginInput): Promise<LoginDecision> {
  const { kv, ip, username, password, creds, sleep } = input;
  const throttleKey = ip ?? "untrusted";

  // A request with no trusted CF-Connecting-IP is anomalous on Workers: bucket it
  // separately and always apply the max delay. Never trust a client-supplied
  // header as an IP substitute (spoofable). Delay is decided before the check.
  const delay = ip === null ? MAX_DELAY_MS : await currentDelay(kv, throttleKey);
  if (delay > 0) {
    await sleep(delay);
  }

  const ok = await verifyCredentials(username, password, creds.expectedUsername, creds.passwordHash, creds.pepper);

  if (!ok) {
    await recordFailure(kv, throttleKey);
    return { outcome: "reject" };
  }

  await clearFailures(kv, throttleKey);
  return { outcome: "accept" };
}
