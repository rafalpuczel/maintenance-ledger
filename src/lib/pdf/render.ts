import { init, renderDocument } from "@formepdf/core";
import wasm from "@formepdf/core/pkg-web/forme_bg.wasm";
import type { ReactElement } from "react";

// Single production entry point for FormePDF on workerd. The init-before-render
// ordering and the `pkg-web/forme_bg.wasm` import specifier are load-bearing and
// follow the F-02 spike's proven recipe (CLAUDE.md): under the `worker` export
// condition the WASM does NOT auto-init at module load, so the caller must pass
// the imported WebAssembly.Module to `init()` once before any render. `init` is
// idempotent (subsequent calls reuse the first promise), so calling it at the
// top of every request is correct and cheap.
export async function renderReportPdf(element: ReactElement): Promise<Uint8Array> {
  await init(wasm);
  return renderDocument(element);
}
