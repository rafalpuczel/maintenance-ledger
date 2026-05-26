import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { SHARED_USERNAME, SHARED_PASSWORD_HASH, SHARED_PASSWORD_PEPPER, SESSION_HMAC_KEY } from "astro:env/server";
import { verifyCredentials } from "@/lib/auth/credentials";
import { signSession, COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/session";
import { currentDelay, recordFailure, clearFailures } from "@/lib/auth/throttle";

const GENERIC_ERROR = "Invalid username or password";

function clientIp(headers: Headers): string {
  return headers.get("CF-Connecting-IP") ?? "local";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const username = (form.get("username") as string | null) ?? "";
  const password = (form.get("password") as string | null) ?? "";

  const ip = clientIp(context.request.headers);
  const kv = env.SESSION;

  const delay = await currentDelay(kv, ip);
  if (delay > 0) {
    await sleep(delay);
  }

  const ok = await verifyCredentials(username, password, SHARED_USERNAME, SHARED_PASSWORD_HASH, SHARED_PASSWORD_PEPPER);

  if (!ok) {
    await recordFailure(kv, ip);
    return context.redirect(`/login?error=${encodeURIComponent(GENERIC_ERROR)}`);
  }

  await clearFailures(kv, ip);
  const value = await signSession(SESSION_HMAC_KEY);
  context.cookies.set(COOKIE_NAME, value, sessionCookieOptions());
  return context.redirect("/");
};
