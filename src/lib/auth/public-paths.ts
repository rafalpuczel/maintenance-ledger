// Public surfaces reachable without a session. Everything else is gated.
// Kept free of virtual-module imports (astro:*) so it stays importable under
// plain-Node Vitest — see context/foundation/lessons.md (S-06).
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/api/auth/logout"]);
const PUBLIC_PREFIXES = ["/_astro/", "/favicon"];

export function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) {
    return true;
  }
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
