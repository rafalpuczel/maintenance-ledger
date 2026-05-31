// Shared async-action result contract. API routes (src/pages/api/**) return one
// of these as JSON; islands consume them through the submit helper. Keeping the
// shape in one place keeps the route and client sides in lockstep.

export interface ActionSuccess<TData = unknown> {
  ok: true;
  // human-facing outcome, shown as a success/warning toast
  message: string;
  // the post-mutation resource (created/updated row, or deleted id) so the
  // client can patch its local collection without a separate read
  data?: TData;
  // set when the action should client-navigate afterwards (e.g. create lands
  // on a new page); the island pushState-navigates there
  redirectTo?: string;
  // success-with-warning: the action succeeded but a non-fatal follow-up failed
  // (e.g. "sent, but could not record the send"). Toast as a warning, not error.
  warning?: boolean;
}

export interface ActionError {
  ok: false;
  // human-facing error message
  error: string;
  // when the error maps to a specific form field (e.g. "slug" already taken),
  // the island renders it under that FormField instead of toasting it
  field?: string;
}

export type ActionResult<TData = unknown> = ActionSuccess<TData> | ActionError;
