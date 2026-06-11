# Spike verdict — editor + HTML sanitizer on workerd

**Date:** 2026-05-31
**Question:** Which rich-text editor + server-side HTML sanitizer pair bundles and runs under `@astrojs/cloudflare` v13 (workerd), given the body is now WYSIWYG rich HTML?

## Finding (research, not a build spike)

The two popular server-side sanitizers both fight workerd in this project (which does **not** enable `nodejs_compat`):

- **`sanitize-html`** — depends on Node's `process` global (absent on workerd) and its `htmlparser2` dependency has TypeScript/bundle errors reported on Cloudflare Pages/Workers. Would need a `globalThis.process` shim + bundle workarounds — exactly the edge-bundling landmine class `CLAUDE.md` warns about (cf. FormePDF WASM, `@pdf-lib/fontkit`).
- **`isomorphic-dompurify` / `DOMPurify`** — needs a DOM/`window`; open workerd failure ([workerd#5752](https://github.com/cloudflare/workerd/issues/5752)). A `linkedom`/`jsdom` shim bloats the Worker and adds runtime risk. Heaviest, riskiest option on this runtime.

Cloudflare's own guidance for HTML on the edge points at `HTMLRewriter` (a streaming rewriter, not an allowlist sanitizer — wrong shape for a small synchronous string sanitize).

## Verdict — **PASS (hand-written, zero-dep sanitizer)**

Because the allowlist is **tiny and fixed** (12 tags, `href` only on `<a>`, schemes `http|https|mailto`), a small dependency-free sanitizer is *more* reliable here than forcing a Node-oriented library onto the edge:
- **Sanitizer:** hand-written `src/lib/email-templates/sanitize.ts` — default-deny tokenizer that keeps only allowlisted tags/attrs. Zero deps → guaranteed to bundle/run on workerd; no `process`/DOM/`nodejs_compat` needed. Security risk mitigated by an aggressive default-deny design + a thorough XSS test suite (`<script>`, `on*` handlers, `style`, `<img>`/`<iframe>`, `javascript:` href, malformed tags). Runs server-side on **save** and on **send**.
- **Editor:** **Tiptap** (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`) — client-only (no workerd constraint), clean HTML output, good keyboard/a11y support for the WCAG-AA bar. Toolbar restricted to bold/italic, bulleted/numbered lists, h2/h3 headers, link.

**No build spike needed** for the sanitizer (no dep to bundle-test). The only new deps are the client-only Tiptap packages (install approval at implement time). The Phase-1 "spike build" criterion is satisfied by the architecture decision: nothing new lands on the Worker bundle, so `npm run build` workerd-compat for the sanitizer is not at risk.

Decision rule from the plan honored: picked the option that bundles + runs cleanly on workerd with the smallest footprint. The documented plain-text fallback is NOT needed.
