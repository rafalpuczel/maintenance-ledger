// Per-IP soft throttle for the login endpoint. Resists credential-stuffing at
// scale while never hard-locking a user: failures below the free threshold add
// no delay, above it add a bounded growing delay. KV is injected so the
// decision logic stays unit-testable.

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

const FAILURE_TTL_SECONDS = 15 * 60;
const FREE_THRESHOLD = 5;
const BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 5000;

// Pure delay schedule: monotonic, bounded, zero for the first FREE_THRESHOLD
// failures (so an honest mistype of 3 is never punished).
export function delayForFailures(count: number): number {
  if (count <= FREE_THRESHOLD) {
    return 0;
  }
  const over = count - FREE_THRESHOLD;
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (over - 1));
}

function failureKey(ip: string): string {
  return `login_fail:${ip}`;
}

async function readCount(kv: KVLike, ip: string): Promise<number> {
  const raw = await kv.get(failureKey(ip));
  const parsed = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function currentDelay(kv: KVLike, ip: string): Promise<number> {
  return delayForFailures(await readCount(kv, ip));
}

export async function recordFailure(kv: KVLike, ip: string): Promise<void> {
  const next = (await readCount(kv, ip)) + 1;
  await kv.put(failureKey(ip), String(next), { expirationTtl: FAILURE_TTL_SECONDS });
}

export async function clearFailures(kv: KVLike, ip: string): Promise<void> {
  await kv.delete(failureKey(ip));
}
