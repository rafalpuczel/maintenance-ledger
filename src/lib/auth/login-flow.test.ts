import { describe, it, expect } from "vitest";
import { decideLogin, type LoginCreds } from "./login-flow";
import { hashPassword } from "./credentials";
import { MAX_DELAY_MS, type KVLike } from "./throttle";

// A spy KV that records every put/delete key, so we can assert WHICH throttle
// call fired (recordFailure => put on login_fail:<key>; clearFailures => delete)
// without re-reading the counter. Backed by a real Map so reads stay consistent.
function spyKV() {
  const store = new Map<string, string>();
  const puts: string[] = [];
  const deletes: string[] = [];
  const kv: KVLike = {
    get(key) {
      return Promise.resolve(store.get(key) ?? null);
    },
    put(key, value) {
      puts.push(key);
      store.set(key, value);
      return Promise.resolve();
    },
    delete(key) {
      deletes.push(key);
      store.delete(key);
      return Promise.resolve();
    },
  };
  return { kv, puts, deletes };
}

// A sleep spy that records the delay it was asked to apply and returns
// immediately — G4 asserts the delay value without a real wall-clock wait.
function spySleep() {
  const calls: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    calls.push(ms);
    return Promise.resolve();
  };
  return { sleep, calls };
}

const PEPPER_B64 = btoa("test-pepper-bytes"); // any base64 string; codec must round-trip
const EXPECTED_USERNAME = "admin";
const RIGHT_PASSWORD = "correct horse battery";

async function creds(): Promise<LoginCreds> {
  return {
    expectedUsername: EXPECTED_USERNAME,
    passwordHash: await hashPassword(RIGHT_PASSWORD, PEPPER_B64),
    pepper: PEPPER_B64,
  };
}

const IP = "203.0.113.7";
const FAIL_KEY = `login_fail:${IP}`;
const UNTRUSTED_KEY = "login_fail:untrusted";

describe("decideLogin wiring", () => {
  it("G2: wrong password → reject AND records a failure against the IP key", async () => {
    const { kv, puts, deletes } = spyKV();
    const { sleep } = spySleep();

    const decision = await decideLogin({
      kv,
      ip: IP,
      username: EXPECTED_USERNAME,
      password: "wrong",
      creds: await creds(),
      sleep,
    });

    expect(decision.outcome).toBe("reject");
    expect(puts).toEqual([FAIL_KEY]); // recordFailure fired once, with the IP bucket
    expect(deletes).toEqual([]); // clearFailures did NOT fire
  });

  it("G3: correct creds → accept AND clears the IP key; never records", async () => {
    const { kv, puts, deletes } = spyKV();
    const { sleep } = spySleep();

    const decision = await decideLogin({
      kv,
      ip: IP,
      username: EXPECTED_USERNAME,
      password: RIGHT_PASSWORD,
      creds: await creds(),
      sleep,
    });

    expect(decision.outcome).toBe("accept");
    expect(deletes).toEqual([FAIL_KEY]); // clearFailures fired once, with the IP bucket
    expect(puts).toEqual([]); // recordFailure did NOT fire
  });

  it("G4: null IP → MAX_DELAY_MS applied against the 'untrusted' bucket, no client header read", async () => {
    const { kv, puts } = spyKV();
    const { sleep, calls } = spySleep();

    // decideLogin receives `ip` as a parameter — it cannot read any client-supplied
    // header. Passing ip: null is the structural proof the bucket can't be spoofed.
    const decision = await decideLogin({
      kv,
      ip: null,
      username: EXPECTED_USERNAME,
      password: "wrong",
      creds: await creds(),
      sleep,
    });

    expect(calls).toEqual([MAX_DELAY_MS]); // max delay applied, without a real sleep
    expect(decision.outcome).toBe("reject");
    expect(puts).toEqual([UNTRUSTED_KEY]); // failure bucketed under "untrusted", not an IP
  });

  it("G6: wrong-username+right-password and right-username+wrong-password are indistinguishable", async () => {
    const c = await creds();
    const { sleep } = spySleep();

    const wrongUser = await decideLogin({
      kv: spyKV().kv,
      ip: IP,
      username: "intruder",
      password: RIGHT_PASSWORD,
      creds: c,
      sleep,
    });
    const wrongPass = await decideLogin({
      kv: spyKV().kv,
      ip: IP,
      username: EXPECTED_USERNAME,
      password: "wrong",
      creds: c,
      sleep,
    });

    // Same decision kind from both faces → no user enumeration at the seam.
    expect(wrongUser.outcome).toBe("reject");
    expect(wrongPass.outcome).toBe("reject");
    expect(wrongUser).toEqual(wrongPass);
  });

  it("edge: empty username and password (form defaults) still reject and record", async () => {
    const { kv, puts } = spyKV();
    const { sleep } = spySleep();

    const decision = await decideLogin({
      kv,
      ip: IP,
      username: "",
      password: "",
      creds: await creds(),
      sleep,
    });

    expect(decision.outcome).toBe("reject");
    expect(puts).toEqual([FAIL_KEY]);
  });
});
