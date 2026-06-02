import type { APIRoute } from "astro";
// KV bindings come from cloudflare:workers; astro:env/server (below) exposes typed
// secrets but not bindings — hence two env sources in this one file.
import { env } from "cloudflare:workers";
import { SHARED_USERNAME, SHARED_PASSWORD_HASH, SHARED_PASSWORD_PEPPER, SESSION_HMAC_KEY } from "astro:env/server";
import { signSession, COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";
import { recordFailure } from "@/lib/auth/throttle";
import { decideLogin } from "@/lib/auth/login-flow";

const GENERIC_ERROR = "Invalid username or password";

function clientIp(headers: Headers): string | null {
  return headers.get("CF-Connecting-IP");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const POST: APIRoute = async (context) => {
  const ip = clientIp(context.request.headers);
  const throttleKey = ip ?? "untrusted";
  const kv = env.SESSION;

  try {
    const form = await context.request.formData();
    const username = (form.get("username") as string | null) ?? "";
    const password = (form.get("password") as string | null) ?? "";

    const decision = await decideLogin({
      kv,
      ip,
      username,
      password,
      creds: {
        expectedUsername: SHARED_USERNAME,
        passwordHash: SHARED_PASSWORD_HASH,
        pepper: SHARED_PASSWORD_PEPPER,
      },
      sleep,
    });

    if (decision.outcome === "reject") {
      return context.redirect(`/login?error=${encodeURIComponent(GENERIC_ERROR)}`);
    }

    const value = await signSession(SESSION_HMAC_KEY);
    context.cookies.set(COOKIE_NAME, value, sessionCookieOptions());
    return context.redirect("/");
  } catch {
    // Fail closed: malformed body, KV outage, or signing error all land here.
    try {
      await recordFailure(kv, throttleKey);
    } catch {
      // best-effort — never let throttle bookkeeping crash the request
    }
    return context.redirect(`/login?error=${encodeURIComponent(GENERIC_ERROR)}`);
  }
};
