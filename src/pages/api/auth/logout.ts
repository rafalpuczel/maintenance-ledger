import type { APIRoute } from "astro";
import { COOKIE_NAME } from "@/lib/auth/session";

export const POST: APIRoute = (context) => {
  context.cookies.delete(COOKIE_NAME, { path: "/" });
  return context.redirect("/login");
};
