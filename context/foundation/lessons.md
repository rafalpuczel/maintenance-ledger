# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Judge lint/build by exit code, never by grepping output

- **Context**: Any phase verification that runs `npm run lint`, `npm run build`, `astro check`, or tests — especially when filtering output through grep/PIPESTATUS in a Bash tool call.
- **Problem**: In projects-crud Phase 4, `@typescript-eslint/no-misused-promises` *crashed* (printed "Oops! Something went wrong!" + stack trace, exit ≠ 0) instead of emitting a normal violation. A `grep -E "error|problem"` over stdout didn't match the crash text, so the run was reported "clean" — and the crash had also aborted linting before two real `ProjectForm.tsx` violations were reported. All three only surfaced in CI (eslint 9.39.4 vs. the locally-resolved 9.29.x), after the code was already pushed and deployed.
- **Rule**: Judge a lint/build/test command pass/fail by its process **exit code**, never by grepping stdout for "error"/"problem". A non-zero exit with no matching grep line means a crash or abort — investigate it, don't treat absence-of-match as success. Be wary of local-vs-CI tool-version drift (pin or check versions when a gate behaves differently).
- **Applies to**: implement, impl-review

## Astro + React 19 lint gotchas under strictTypeChecked

- **Context**: Linting `.astro` pages and React island components (`.tsx`) in this repo's eslint flat config (typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`), especially new pages that redirect in frontmatter or React forms with `onSubmit`.
- **Problem**: In projects-crud, `@typescript-eslint/no-misused-promises` crashed traversing `return Astro.redirect(...)` in `[slug].astro` frontmatter, and an inline `eslint-disable-next-line` could not suppress it (the throw fires during AST traversal, before disable directives apply). Separately, `React.FormEvent`/`FormEventHandler` are marked deprecated in React 19's `@types/react` ("doesn't actually exist"), and a single-use generic type param tripped `no-unnecessary-type-parameters` — all three failed CI.
- **Rule**: (1) Keep `@typescript-eslint/no-misused-promises` turned **off** for `**/*.astro` in `eslint.config.js` — it crashes on frontmatter redirects (`Astro.redirect` returns a `Response` synchronously, so the rule adds no value there) and inline disables can't help. (2) Type form handlers as `React.SubmitEvent<HTMLFormElement>`, not the deprecated `React.FormEvent`/`FormEventHandler` (matches the existing `LoginForm`). (3) Don't introduce generic type params used only once — inline the concrete type.
- **Applies to**: implement, plan

## Zod v4: use top-level format validators, not the deprecated `.string().<format>()` chain

- **Context**: Writing zod validation schemas in `src/lib/<domain>/schema.ts`. This repo is on zod v4 (`^4.4.3`) with `@typescript-eslint/no-deprecated` as an **error**.
- **Problem**: In project-recurring-plugins, `z.string().uuid("…")` lint-errored as deprecated (zod v4 moved format checks to top-level: `z.uuid()`, `z.email()`, `z.url()`). The pre-commit `lint-staged` hook runs `eslint --fix`, which silently auto-corrected the accompanying prettier issues but **cannot** auto-fix a `no-deprecated` violation — so the bad code passed the hook and only a full `npm run lint` (exit 1) caught it. The existing `projects/schema.ts` already uses the correct top-level form (`z.email()`, `z.url()` via `.safeParse`), so the deprecated chain was an inconsistency, not a codebase norm.
- **Rule**: Use top-level zod format validators — `z.uuid()`, `z.email()`, `z.url()`, etc. — never `z.string().uuid()/.email()/.url()`. More broadly: the pre-commit hook's `eslint --fix` only repairs auto-fixable rules (mostly prettier); a non-fixable error (`no-deprecated`, type errors) slides through staged-file linting, so always run the **full** `npm run lint` and judge by exit code before declaring a phase green (reinforces "Judge lint/build by exit code").
- **Applies to**: implement, plan, impl-review
