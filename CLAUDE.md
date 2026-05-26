## Project rules (load-bearing)

- **Deploy via `wrangler deploy`** (Workers Static Assets). NEVER `wrangler pages deploy` — `@astrojs/cloudflare` v13 removed Pages support.
- **PDF rendering uses FormePDF** — `@formepdf/react` (JSX components: `Document`, `Page`, `View`, `Text`, `Image`, `Table`, etc.) + `@formepdf/core` (`renderDocument()` returns `Uint8Array`). Workerd-safe. `@react-pdf/renderer` is blocked on workerd (yoga-layout WASM). `@pdf-lib/fontkit` does not bundle on Workers ([workers-sdk#8140](https://github.com/cloudflare/workers-sdk/issues/8140)) — if you ever fall back to `pdf-lib`, you're locked to the 14 standard fonts.
- **Supabase from Workers = `@supabase/supabase-js` over HTTP/PostgREST.** Never import `pg` from a Worker. Migrations and seed scripts run from a local Node process against the Supabase host directly.
- **Supabase keys = `sb_publishable_...` / `sb_secret_...`** (new system, July 2025+). Never use legacy `anon` / `service_role` for new code. Server-side (Worker) uses `SUPABASE_SECRET_KEY`; client-side (only if needed) uses `SUPABASE_PUBLISHABLE_KEY`.
- **CPU budget**: Workers free tier is 10 ms/req. PDF generation will push past this on real-shaped reports — plan to upgrade to Workers Paid ($5/mo, 30 s/req) at the first p95 timeout. Watch via `wrangler tail` + observability dashboard.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 2

Turn one roadmap item into the first implementation cycle with the **change planning chain**:

```
/10x-roadmap -> /10x-new -> /10x-plan -> /10x-plan-review -> /10x-implement
```

`/10x-new`, `/10x-plan`, `/10x-plan-review`, and `/10x-implement` are the lesson focus. `/10x-frame` and `/10x-research` are not required rituals here; they are escalation paths introduced in the next lesson.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Change setup (lesson focus)** | |
| `/10x-new <change-id>` | You selected a roadmap item and need a stable change folder. Creates `context/changes/<change-id>/change.md` so planning, implementation, progress, commits, and later review all share one identity. Use AFTER roadmap selection, BEFORE `/10x-plan`. |
| **Planning (lesson focus)** | |
| `/10x-plan <change-id>` | You have a change folder and need a reviewable implementation plan. Reads roadmap context, foundation docs, codebase evidence, and any existing change notes; writes `plan.md` and `plan-brief.md` with phases, file contracts, success criteria, and `## Progress`. |
| **Plan readiness (lesson focus)** | |
| `/10x-plan-review <change-id>` | You have `plan.md` and need a light pre-code readiness check. Use it to catch missing end state, weak contracts, malformed progress, scope drift, or blind spots before code changes begin. |
| **Implementation (lesson focus)** | |
| `/10x-implement <change-id> phase <n>` | You have an approved plan and want to execute one phase with verification, manual gate, commit ritual, and SHA write-back to `## Progress`. |
| **Lifecycle closure** | |
| `/10x-archive <change-id>` | A change is merged or intentionally closed. Move it out of active `context/changes/` into archive state. |

### How the chain hands off

- `/10x-new` creates the durable change identity.
- `/10x-plan` turns that identity into an implementation contract.
- `/10x-plan-review` checks the plan before the agent mutates code.
- `/10x-implement` executes one planned phase, verifies, asks for manual confirmation when needed, commits, and records progress.

### Lesson boundaries

- Plan is the default router after roadmap selection. Start with `/10x-plan` unless the problem is unclear or external evidence is blocking.
- Do not run `/10x-frame + /10x-research` as ceremony for every change.
- Do not turn this lesson into a full end-to-end product build. A checkpoint with a planned and partially or fully implemented stream is valid.
- Code review of the implemented diff belongs to Lesson 3 via `/10x-impl-review`.
- Lifecycle closure via `/10x-archive` after a change is merged or intentionally closed.

### Paths used by this lesson

- `context/foundation/roadmap.md` - upstream roadmap
- `context/changes/<change-id>/change.md` - change identity
- `context/changes/<change-id>/plan.md` - implementation contract
- `context/changes/<change-id>/plan-brief.md` - compressed handoff
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
