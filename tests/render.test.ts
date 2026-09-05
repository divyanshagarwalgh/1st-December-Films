import { describe, it, expect } from "vitest";
import { createHtmlRenderer, escapeHtml } from "../src/lib/render";

describe("createHtmlRenderer: streaming markdown subset to HTML", () => {
  it("renders headings, paragraphs and bullets from complete input", () => {
    const r = createHtmlRenderer();
    const html = r.push("## The read\nA paragraph of text.\n\n## Beat sheet\n- one\n- two\n") + r.flush();
    expect(html).toBe('<h2>The read</h2><p>A paragraph of text.</p><h2>Beat sheet</h2><ul><li>one</li><li>two</li></ul>');
  });

  it("streams a paragraph progressively and closes it at the blank line", () => {
    const r = createHtmlRenderer();
    expect(r.push("Hello ")).toBe("<p>Hello ");
    expect(r.push("world.\n")).toBe("world.");
    expect(r.push("\n## Next\n")).toBe("</p><h2>Next</h2>");
    expect(r.flush()).toBe("");
  });

  it("closes an open paragraph when a heading or bullet follows without a blank line", () => {
    const r = createHtmlRenderer();
    const html = r.push("Para\n## H\n- a\nAfter\n") + r.flush();
    expect(html).toBe("<p>Para</p><h2>H</h2><ul><li>a</li></ul><p>After</p>");
  });

  it("renders bold and leaves anchors from the rewriter intact", () => {
    const r = createHtmlRenderer();
    const html = r.push('Closest: <a href="https://x/work/y">Nike, Yard (2023)</a> with **shared device**.\n') + r.flush();
    expect(html).toBe('<p>Closest: <a href="https://x/work/y">Nike, Yard (2023)</a> with <strong>shared device</strong>.</p>');
  });

  it("closes an unclosed bold and list on flush", () => {
    const r = createHtmlRenderer();
    const html = r.push("- **open bold") + r.flush();
    expect(html).toBe("<ul><li><strong>open bold</strong></li></ul>");
  });

  it("does not treat a bullet marker mid-line as a list", () => {
    const r = createHtmlRenderer();
    expect(r.push("a - b\n") + r.flush()).toBe("<p>a - b</p>");
  });
});

describe("escapeHtml", () => {
  it("escapes the four characters that matter", () => {
    expect(escapeHtml('<script>alert("x") & y</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;) &amp; y&lt;/script&gt;");
  });
});
