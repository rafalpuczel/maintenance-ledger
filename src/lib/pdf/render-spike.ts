// THROWAWAY — F-02 go/no-go spike (pdf-render-pipeline). Deleted in Phase 5.
//
// Encapsulates the FormePDF workerd init contract in one place. Under the
// `worker` export condition (node_modules/@formepdf/core/dist/worker.d.ts),
// the WASM does NOT auto-init at module load — Wrangler hands a `.wasm` import
// back as a `WebAssembly.Module`, so the caller must pass it to `init()` once
// before any render. `init()` is idempotent; calling it per request is cheap.
import type { ReactElement } from "react";
import { init, renderDocument } from "@formepdf/core";
import wasm from "@formepdf/core/pkg-web/forme_bg.wasm";

export async function renderSpikePdf(element: ReactElement): Promise<Uint8Array> {
  await init(wasm);
  return renderDocument(element);
}
