import { describe, it, expect } from "vitest";
import { sanitizeBody, escapeHtml } from "./sanitize";

describe("escapeHtml", () => {
  it("escapes the HTML metacharacters", () => {
    expect(escapeHtml(`a & b < c > d " e ' f`)).toBe("a &amp; b &lt; c &gt; d &quot; e &#39; f");
  });
});

describe("sanitizeBody — allowlisted tags survive", () => {
  it("keeps bold/italic/headers/paragraphs/lists", () => {
    const html =
      "<p>Hi <strong>there</strong> <em>friend</em></p><h2>Heading</h2><h3>Sub</h3><ul><li>one</li><li>two</li></ul><ol><li>a</li></ol>";
    expect(sanitizeBody(html)).toBe(html);
  });

  it("keeps <br> as a void tag", () => {
    expect(sanitizeBody("line<br>break")).toBe("line<br>break");
  });
});

describe("sanitizeBody — disallowed content is stripped", () => {
  it("removes <script> tags and keeps no executable markup", () => {
    const out = sanitizeBody('<p>ok</p><script>alert("xss")</script>');
    expect(out).not.toContain("<script");
    expect(out.toLowerCase()).not.toContain("alert");
    expect(out).toContain("<p>ok</p>");
  });

  it("strips on* event handlers (drops the whole disallowed-attr surface on allowed tags)", () => {
    const out = sanitizeBody('<p onclick="steal()">hi</p>');
    expect(out).toBe("<p>hi</p>");
    expect(out).not.toContain("onclick");
  });

  it("strips inline style and class/id from allowed tags", () => {
    const out = sanitizeBody('<p style="color:red" class="x" id="y">hi</p>');
    expect(out).toBe("<p>hi</p>");
  });

  it("removes <img> and <iframe> entirely", () => {
    const out = sanitizeBody('<p>a</p><img src="x" onerror="boom"><iframe src="evil"></iframe><p>b</p>');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("onerror");
    expect(out).toBe("<p>a</p><p>b</p>");
  });

  it("drops HTML comments", () => {
    expect(sanitizeBody("<p>a</p><!-- secret --><p>b</p>")).toBe("<p>a</p><p>b</p>");
  });

  it("escapes a stray '<' that is not a real tag", () => {
    expect(sanitizeBody("2 < 3 and 4 > 1")).toBe("2 &lt; 3 and 4 &gt; 1");
  });
});

describe("sanitizeBody — link handling", () => {
  it("keeps an https href and forces rel + target", () => {
    const out = sanitizeBody('<a href="https://example.com">x</a>');
    expect(out).toBe('<a href="https://example.com" rel="noopener noreferrer" target="_blank">x</a>');
  });

  it("keeps a mailto href", () => {
    const out = sanitizeBody('<a href="mailto:a@b.com">mail</a>');
    expect(out).toContain('href="mailto:a@b.com"');
  });

  it("drops a javascript: href but keeps the element", () => {
    const out = sanitizeBody('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript");
    expect(out).toBe('<a rel="noopener noreferrer" target="_blank">x</a>');
  });

  it("drops an obfuscated javascript: href with embedded control chars", () => {
    const out = sanitizeBody('<a href="java\tscript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain("script:");
  });

  it("drops a data: href", () => {
    const out = sanitizeBody('<a href="data:text/html,<script>">x</a>');
    expect(out).not.toContain("data:");
  });
});

describe("sanitizeBody — malformed input", () => {
  it("closes elements left open", () => {
    expect(sanitizeBody("<p>unclosed")).toBe("<p>unclosed</p>");
  });

  it("ignores a stray close tag with no matching open", () => {
    expect(sanitizeBody("hello</p>")).toBe("hello");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeBody("")).toBe("");
  });
});
