import { useCallback, useState } from "react";
import type { ActionResult } from "./types";

// Centralizes the fetch + JSON-parse + pending-state dance every async island
// shares. Same-origin POST, so the HMAC session cookie rides automatically — no
// CSRF token. Accepts FormData (multipart/form fields) or a plain object (sent
// as JSON). Never toasts: the caller decides field-vs-toast routing from the
// returned ActionResult. A network/parse failure resolves to a generic error
// result rather than throwing, so call sites have one code path.

type Body = FormData | Record<string, unknown>;

async function postAction<TData>(action: string, body: Body): Promise<ActionResult<TData>> {
  let response: Response;
  try {
    const init: RequestInit = { method: "POST" };
    if (body instanceof FormData) {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers = { "Content-Type": "application/json" };
    }
    response = await fetch(action, init);
  } catch {
    return { ok: false, error: "Network error — please try again." };
  }

  try {
    const json: unknown = await response.json();
    return json as ActionResult<TData>;
  } catch {
    return { ok: false, error: "Something went wrong." };
  }
}

export function useSubmit<TData = unknown>() {
  const [pending, setPending] = useState(false);

  const submit = useCallback(async (action: string, body: Body): Promise<ActionResult<TData>> => {
    setPending(true);
    try {
      return await postAction<TData>(action, body);
    } finally {
      setPending(false);
    }
  }, []);

  return { submit, pending };
}
