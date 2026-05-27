## Project rules (load-bearing)

- **Deploy via `wrangler deploy`** (Workers Static Assets). NEVER `wrangler pages deploy` — `@astrojs/cloudflare` v13 removed Pages support.
- **PDF rendering uses FormePDF** — `@formepdf/react` (JSX components: `Document`, `Page`, `View`, `Text`, `Image`, `Table`, etc.) + `@formepdf/core` (`renderDocument()` returns `Uint8Array`). Workerd-safe. `@react-pdf/renderer` is blocked on workerd (yoga-layout WASM). `@pdf-lib/fontkit` does not bundle on Workers ([workers-sdk#8140](https://github.com/cloudflare/workers-sdk/issues/8140)) — if you ever fall back to `pdf-lib`, you're locked to the 14 standard fonts.
- **Supabase from Workers = `@supabase/supabase-js` over HTTP/PostgREST.** Never import `pg` from a Worker. Migrations and seed scripts run from a local Node process against the Supabase host directly.
- **Supabase keys = `sb_publishable_...` / `sb_secret_...`** (new system, July 2025+). Never use legacy `anon` / `service_role` for new code. Server-side (Worker) uses `SUPABASE_SECRET_KEY`; client-side (only if needed) uses `SUPABASE_PUBLISHABLE_KEY`.
- **CPU budget**: Workers free tier is 10 ms/req. PDF generation will push past this on real-shaped reports — plan to upgrade to Workers Paid ($5/mo, 30 s/req) at the first p95 timeout. Watch via `wrangler tail` + observability dashboard.
- **Auth password verification = peppered Web Crypto HMAC, NOT bcrypt.** `SHARED_PASSWORD_HASH` is `base64url(HMAC-SHA256(password, SHARED_PASSWORD_PEPPER))` (`src/lib/auth/credentials.ts`), verified with a constant-time compare. bcrypt/argon2/PBKDF2 are banned from the request path: they are deliberately CPU-bound and blow the 10 ms free-tier budget (a cost-12 `bcryptjs.compare` ~100 ms gets the request killed). A slow KDF buys little here — the credential is a single deploy secret, not a user-table dump — and online guessing is defended by the per-IP `SESSION` KV throttle. Mint a hash with the `hashPassword()` helper / matching `node:crypto` HMAC.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
