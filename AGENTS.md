# Repository Guidelines

10x Astro Starter — Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers via `@astrojs/cloudflare`.

## Hard Rules

- CI triggers only on the `master` branch (see `@.github/workflows/ci.yml`).
- API routes under `src/pages/api/**` must export `const prerender = false`. `output: "server"` in `@astro.config.mjs` does not exempt them.
- Run `npx astro sync` after editing `astro.config.mjs` or its `env.schema`. CI runs it before `npm run lint`, and a stale `.astro/types.d.ts` will break the type-checked lint.
- Supabase credentials live in `.env` (Node) or `.dev.vars` (Cloudflare local) — both gitignored. `astro:env/server` enforces server-only access; never reference them from client code.
- Enable RLS on every new Supabase table with granular per-operation, per-role policies. Migrations live in `supabase/migrations/` and are named `YYYYMMDDHHmmss_short_description.sql`.

## Build, Test, and Development Commands

- `npm run dev` — start the dev server on the Cloudflare workerd runtime.
- `npm run build` — production SSR build.
- `npm run lint` / `npm run lint:fix` — ESLint with `strictTypeChecked` + `stylisticTypeChecked` and `react-compiler/react-compiler: error`.
- `npm run format` — Prettier with `prettier-plugin-astro` + `prettier-plugin-tailwindcss`.
- `npx shadcn@latest add <name>` — install a shadcn/ui component into `src/components/ui/` ("new-york" style, see `@components.json`).
- Husky pre-commit runs `lint-staged`: `eslint --fix` on `*.{ts,tsx,astro}`, `prettier --write` on `*.{json,css,md}`.

## Project Structure & Conventions

- Path alias `@/*` → `./src/*` (see `@tsconfig.json`).
- `src/pages/` Astro pages; `src/pages/api/` endpoints (uppercase `GET`/`POST` exports, validate input with zod).
- `src/components/` Astro for static markup, React only for interactivity; shadcn primitives in `src/components/ui/`.
- `src/components/hooks/` for extracted React hooks (no Next.js directives like `"use client"`).
- `src/lib/` helpers; `src/lib/services/` for extracted business logic.
- `src/types.ts` shared entity and DTO types.
- Use `cn()` from `@/lib/utils` for Tailwind class merging — do not concatenate class strings.
- Auth wiring: `src/lib/supabase.ts` (SSR client), `src/middleware.ts` (resolves `locals.user`, redirects routes listed in `PROTECTED_ROUTES`).

## Environment

- Node v22.14.0 (`@.nvmrc`).
- Local Supabase: `npx supabase start` (Docker, ~7 GB RAM); copy printed credentials into `.env` and `.dev.vars`.
- Deploy: `npx wrangler deploy`; set `SUPABASE_URL` / `SUPABASE_KEY` via `npx wrangler secret put` or the Cloudflare dashboard.

## Commit & PR Guidelines

- Short, imperative, sentence-case subject (history: *"Bootstrap 10x-astro-starter + apply non-breaking npm audit fixes"*) — no Conventional Commit prefixes.
- PR target is `master`. CI runs `npm ci`, `npx astro sync`, `npm run lint`, `npm run build` with `SUPABASE_URL` / `SUPABASE_KEY` repository secrets; all four steps must pass.
