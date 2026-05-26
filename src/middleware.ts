import { defineMiddleware } from "astro:middleware";
import { SESSION_HMAC_KEY } from "astro:env/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth/session";

// Public surfaces reachable without a session. Everything else is gated.
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);
const PUBLIC_PREFIXES = ["/_astro/", "/favicon"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export const onRequest = defineMiddleware(async (context, next) => {
  const cookie = context.cookies.get(COOKIE_NAME)?.value;
  const authenticated = cookie ? await verifySession(SESSION_HMAC_KEY, cookie) : false;
  context.locals.authenticated = authenticated;

  if (!authenticated && !isPublic(context.url.pathname)) {
    return context.redirect("/login");
  }

  return next();
});
