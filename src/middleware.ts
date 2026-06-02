import { defineMiddleware } from "astro:middleware";
import { SESSION_HMAC_KEY } from "astro:env/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth/session";
import { isPublic } from "@/lib/auth/public-paths";

export const onRequest = defineMiddleware(async (context, next) => {
  const cookie = context.cookies.get(COOKIE_NAME)?.value;
  const authenticated = cookie ? await verifySession(SESSION_HMAC_KEY, cookie) : false;
  context.locals.authenticated = authenticated;

  if (!authenticated && !isPublic(context.url.pathname)) {
    return context.redirect("/login");
  }

  return next();
});
