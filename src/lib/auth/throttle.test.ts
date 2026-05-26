import { describe, it, expect } from "vitest";
import { delayForFailures, currentDelay, recordFailure, clearFailures, type KVLike } from "./throttle";

function fakeKV(): KVLike {
  const store = new Map<string, string>();
  return {
    get(key) {
      return Promise.resolve(store.get(key) ?? null);
    },
    put(key, value) {
      store.set(key, value);
      return Promise.resolve();
    },
    delete(key) {
      store.delete(key);
      return Promise.resolve();
    },
  };
}

describe("delayForFailures", () => {
  it("does not punish an honest mistype (<= 5 failures)", () => {
    for (let n = 0; n <= 5; n++) {
      expect(delayForFailures(n)).toBe(0);
    }
  });

  it("grows after the free threshold and is bounded", () => {
    expect(delayForFailures(6)).toBe(250);
    expect(delayForFailures(7)).toBe(500);
    expect(delayForFailures(100)).toBe(5000);
  });

  it("is monotonically non-decreasing", () => {
    let prev = -1;
    for (let n = 0; n <= 50; n++) {
      const d = delayForFailures(n);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
  });
});

describe("throttle KV flow", () => {
  it("accumulates failures and clears on success", async () => {
    const kv = fakeKV();
    const ip = "203.0.113.7";
    expect(await currentDelay(kv, ip)).toBe(0);
    for (let i = 0; i < 6; i++) {
      await recordFailure(kv, ip);
    }
    expect(await currentDelay(kv, ip)).toBe(250);
    await clearFailures(kv, ip);
    expect(await currentDelay(kv, ip)).toBe(0);
  });
});
