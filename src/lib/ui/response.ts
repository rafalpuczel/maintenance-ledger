import type { ActionError, ActionSuccess } from "./types";

// JSON response builders for API routes. These replace the old
// `context.redirect(...?ok=/?error=)` pattern: routes now always return JSON
// matching the ActionResult contract the submit helper expects.

export function actionOk<TData>(body: Omit<ActionSuccess<TData>, "ok">, init?: ResponseInit): Response {
  return Response.json({ ok: true, ...body } satisfies ActionSuccess<TData>, {
    status: 200,
    ...init,
  });
}

export function actionError(body: Omit<ActionError, "ok">, status = 400): Response {
  return Response.json({ ok: false, ...body } satisfies ActionError, { status });
}
