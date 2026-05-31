// Server-side HTML sanitizer for email-template bodies. This is the no-leak /
// anti-injection chokepoint: it runs in the Worker on SAVE (so stored HTML is
// already clean) and again on SEND (defense in depth). Client-side editor output
// is never trusted as the security boundary.
//
// Zero dependencies on purpose. The popular sanitizers fight workerd
// (sanitize-html needs node:process + htmlparser2 bundling issues; DOMPurify
// needs a DOM and has an open workerd failure). The allowlist here is tiny and
// fixed, so a default-deny tokenizer is more reliable than forcing a Node library
// onto the edge. See context/changes/email-templates/spike-sanitizer.md.
//
// Design: DEFAULT DENY. We tokenize into tags and text. A tag is emitted only if
// its name is in ALLOWED_TAGS; its attributes are dropped except an `href` on
// <a> that passes the scheme check (every emitted <a> is forced to a safe rel +
// target). Anything that is not an allowlisted tag becomes escaped text — so a
// <script>, <style>, an on* handler, an <img>, or a stray `<` can never survive
// as live markup. Raw-text elements (script/style/…) have their CONTENT dropped
// too, not just their tags.

// Allowlisted tags. h1 is reserved for app chrome; no media (img/iframe).
export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "strong",
  "em",
  "b",
  "i",
  "a",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "p",
  "br",
]);

// Void tag: emitted without a closing tag and never carries children.
const VOID_TAGS: ReadonlySet<string> = new Set(["br"]);

// Raw-text / sensitive elements whose CONTENT must be dropped along with the
// tag — escaping the inner text is not enough (a <script> body is code, a
// <style> body is CSS; neither belongs in the output at all).
const RAW_TEXT_TAGS: ReadonlySet<string> = new Set(["script", "style", "title", "textarea", "noscript", "template"]);

// Allowed URL schemes for <a href>. Relative/anchor hrefs are also allowed (no
// scheme). Anything with a disallowed scheme (javascript:, data:, vbscript:, …)
// drops the href entirely.
const ALLOWED_SCHEMES = ["http:", "https:", "mailto:"];

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Decide whether an <a> href is safe to keep. Returns the trimmed href to emit,
// or null to drop the attribute. A value that parses to a disallowed scheme is
// dropped; a value with no scheme (relative, anchor) is kept after escaping.
function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;

  // Scheme-relative URLs (//host) inherit the page scheme — disallow to keep the
  // set strict and predictable in an email context.
  if (value.startsWith("//")) return null;

  // A leading "<scheme>:" — match a URL scheme per RFC3986 (letter then
  // letters/digits/+/-/.). Whitespace and C0 control chars anywhere in the value
  // (a common obfuscation, e.g. "java\tscript:") are removed first so they can't
  // sneak a scheme past the check. Build the cleaned string char-by-char by code
  // point, avoiding both a control-char regex literal and a string spread.
  let stripped = "";
  for (let k = 0; k < value.length; k++) {
    if (value.charCodeAt(k) > 0x20) stripped += value[k];
  }
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(stripped);
  if (schemeMatch && !ALLOWED_SCHEMES.includes(`${schemeMatch[1].toLowerCase()}:`)) {
    return null;
  }
  return value;
}

// Extract the (possibly null) safe href from an <a> start tag's attribute text.
// All other attributes (class, id, style, on*, src, …) are ignored.
function extractHref(attrText: string): string | null {
  // name="value" | name='value' | name=value | name
  const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let href: string | null = null;
  for (let match = attrRe.exec(attrText); match !== null; match = attrRe.exec(attrText)) {
    if (match[1].toLowerCase() === "href") {
      // Groups: double-quoted | single-quoted | unquoted value. A bare `href`
      // with no value leaves all three undefined; `|| ""` collapses that (and an
      // empty match) to the empty string, which safeHref drops.
      href = safeHref(match[2] || match[3] || match[4] || "");
    }
  }
  return href;
}

// Build the emitted attribute string for an allowlisted tag. Only <a> carries
// attributes (a safe href, always with a forced rel/target).
function sanitizeAttributes(tagName: string, attrText: string): string {
  if (tagName !== "a") return "";
  const href = extractHref(attrText);
  const hrefAttr = href === null ? "" : ` href="${escapeHtml(href)}"`;
  return `${hrefAttr} rel="noopener noreferrer" target="_blank"`;
}

// The result of consuming one chunk at position `lt`: what to append and where
// to resume. Mutates the caller's open-element stack as a side effect.
interface Step {
  emit: string;
  next: number;
}

// Sanitize a body HTML string to the fixed allowlist. Pure and deterministic.
export function sanitizeBody(html: string): string {
  if (!html) return "";

  const len = html.length;
  // Track open allowlisted elements so we only emit matching close tags.
  const openStack: string[] = [];
  const parts: string[] = [];
  let i = 0;

  while (i < len) {
    const lt = html.indexOf("<", i);

    // No more tags: the rest is text.
    if (lt === -1) {
      parts.push(escapeHtml(html.slice(i)));
      break;
    }

    // Text before this "<".
    if (lt > i) {
      parts.push(escapeHtml(html.slice(i, lt)));
    }

    const step = consumeTag(html, lt, openStack);
    parts.push(step.emit);
    i = step.next;
  }

  // Close any elements left open (malformed input), innermost first.
  for (const tag of [...openStack].reverse()) {
    parts.push(`</${tag}>`);
  }

  return parts.join("");
}

// Consume the markup starting at `lt` (the index of a "<"). Returns what to emit
// and the resume index, and may push/pop the open-element stack.
function consumeTag(html: string, lt: number, openStack: string[]): Step {
  const len = html.length;

  // Comments and CDATA / declarations / processing instructions: drop wholesale.
  if (html.startsWith("<!--", lt)) {
    const end = html.indexOf("-->", lt + 4);
    return { emit: "", next: end === -1 ? len : end + 3 };
  }
  if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
    const end = html.indexOf(">", lt + 1);
    return { emit: "", next: end === -1 ? len : end + 1 };
  }

  const gt = html.indexOf(">", lt + 1);
  if (gt === -1) {
    // No closing ">" — treat the rest as text so a stray "<" is escaped.
    return { emit: escapeHtml(html.slice(lt)), next: len };
  }

  const rawTag = html.slice(lt + 1, gt);
  const isClose = rawTag.startsWith("/");
  const tagBody = (isClose ? rawTag.slice(1) : rawTag).trim();
  const nameMatch = /^([a-zA-Z][a-zA-Z0-9]*)/.exec(tagBody);

  // Not a real tag (e.g. "< 3"): escape the literal "<...>" as text.
  if (!nameMatch) {
    return { emit: escapeHtml(html.slice(lt, gt + 1)), next: gt + 1 };
  }

  const tagName = nameMatch[1].toLowerCase();

  // Raw-text / sensitive elements: drop the tag AND its entire content (a
  // <script>alert(1)</script> must not leave `alert(1)` behind as text). On an
  // opening such tag, skip to the end of its matching close tag.
  if (!isClose && RAW_TEXT_TAGS.has(tagName)) {
    const closeIdx = html.toLowerCase().indexOf(`</${tagName}`, gt + 1);
    if (closeIdx === -1) {
      return { emit: "", next: len };
    }
    const closeGt = html.indexOf(">", closeIdx);
    return { emit: "", next: closeGt === -1 ? len : closeGt + 1 };
  }

  // Disallowed element: drop the tag entirely (its text children, if any, are
  // still processed on later iterations). Do NOT escape it back into the output.
  if (!ALLOWED_TAGS.has(tagName)) {
    return { emit: "", next: gt + 1 };
  }

  if (isClose) {
    return { emit: emitClose(tagName, openStack), next: gt + 1 };
  }

  // Start tag.
  const attrText = tagBody.slice(nameMatch[1].length);
  if (VOID_TAGS.has(tagName)) {
    return { emit: `<${tagName}>`, next: gt + 1 };
  }
  openStack.push(tagName);
  return { emit: `<${tagName}${sanitizeAttributes(tagName, attrText)}>`, next: gt + 1 };
}

// Emit a close tag only if it matches an open element we wrote, closing any
// intervening unclosed inline elements too (innermost first).
function emitClose(tagName: string, openStack: string[]): string {
  const idx = openStack.lastIndexOf(tagName);
  if (idx === -1) return "";
  const closed = openStack.splice(idx).reverse();
  return closed.map((t) => `</${t}>`).join("");
}
