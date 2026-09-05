import { describe, it, expect } from "vitest";
import { createOutputParser } from "../src/lib/protocol";

describe("createOutputParser: the model's output protocol", () => {
  it("reads the KIND header line and does not pass it through as visible text", () => {
    const p = createOutputParser();
    const out = p.push("KIND: brief\n## The read\nA paragraph.");
    expect(p.kind).toBe("brief");
    expect(out.visible).toBe("## The read\nA paragraph.");
  });

  it("waits for the whole first line before deciding the kind", () => {
    const p = createOutputParser();
    expect(p.push("KIND: scr").visible).toBe("");
    expect(p.kind).toBeNull();
    expect(p.push("ipt\n## The read").visible).toBe("## The read");
    expect(p.kind).toBe("script");
  });

  it("treats KIND: none as a refusal and passes the explanation through", () => {
    const p = createOutputParser();
    const out = p.push("KIND: none\nThis does not look like a script or a brief.");
    expect(p.kind).toBe("none");
    expect(out.visible).toBe("This does not look like a script or a brief.");
  });

  it("falls back to unknown when there is no header", () => {
    const p = createOutputParser();
    const out = p.push("## The read\nText\n");
    expect(p.kind).toBe("unknown");
    expect(out.visible).toBe("## The read\nText\n");
  });

  it("strips the trailing extracted block from the visible text and parses it", () => {
    const p = createOutputParser();
    const a = p.push("KIND: script\n## The read\nText.\n<<extracted>>");
    const b = p.push('{"kind":"script","complexity":"standard"}<<end>>');
    expect(a.visible + b.visible).toBe("## The read\nText.\n");
    expect(p.extracted).toEqual({ kind: "script", complexity: "standard" });
  });

  it("holds back a partial <<extracted marker at the end of a chunk", () => {
    const p = createOutputParser();
    expect(p.push("KIND: script\nText <<extr").visible).toBe("Text ");
    expect(p.push("acted>>{}<<end>>").visible).toBe("");
    expect(p.extracted).toEqual({});
  });

  it("emits a section event when a heading starts a line", () => {
    const p = createOutputParser();
    const out = p.push("KIND: script\n## The read\nText\n## Beat sheet\n- one\n");
    expect(out.sections).toEqual(["The read", "Beat sheet"]);
  });

  it("does not choke on a malformed extracted block", () => {
    const p = createOutputParser();
    p.push("KIND: script\nText\n<<extracted>>not json<<end>>");
    expect(p.extracted).toBeNull();
    expect(p.flush().visible).toBe("");
  });

  it("streams body text immediately and flush releases a held bracket that never became a marker", () => {
    const p = createOutputParser();
    expect(p.push("KIND: script\nA tail <").visible).toBe("A tail ");
    expect(p.flush().visible).toBe("<");
  });
});
