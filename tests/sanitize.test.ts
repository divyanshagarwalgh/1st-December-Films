import { describe, it, expect } from "vitest";
import { sanitizeOutput, createSentenceSanitizer } from "../src/lib/sanitize";

const EM = String.fromCharCode(8212);
const EN = String.fromCharCode(8211);

describe("sanitizeOutput", () => {
  it("replaces em and en dashes with a comma", () => {
    expect(sanitizeOutput(`one ${EM} two ${EN} three`)).toBe("one, two, three");
    expect(sanitizeOutput(`one${EM}two`)).toBe("one, two");
  });

  it("keeps a hyphen in compounds", () => {
    expect(sanitizeOutput("a run-up and a stop-motion frame")).toBe("a run-up and a stop-motion frame");
  });

  it("removes any sentence that mentions money in rupees", () => {
    const text = "Keep this sentence. This will cost about Rs 20 lakh to shoot. And this one stays.";
    expect(sanitizeOutput(text)).toBe("Keep this sentence. And this one stays.");
    expect(sanitizeOutput("Budget of ₹5 crore is needed. Fine.")).toBe("Fine.");
    expect(sanitizeOutput("Roughly INR 3,00,000 per day. Fine.")).toBe("Fine.");
  });

  it("removes a bullet line that mentions money", () => {
    const text = "- Locations: two\n- Crowd of 200 extras will run to Rs 4 lakh\n- Night shoot";
    expect(sanitizeOutput(text)).toBe("- Locations: two\n- Night shoot");
  });

  it("keeps every non-money sentence on a line that has a dot without a following space", () => {
    const t = 'Keep this. See <a href="https://1stdecember.com/work/x">X</a> for the device. It runs to Rs 5.5 lakh a day. And this stays.';
    expect(sanitizeOutput(t)).toBe('Keep this. See <a href="https://1stdecember.com/work/x">X</a> for the device. And this stays.');
  });

  it("strips leftover marker brackets", () => {
    expect(sanitizeOutput("tail [[")).toBe("tail");
    expect(sanitizeOutput("mid ]] text")).toBe("mid text");
  });

  it("tidies the conjunction left behind when a marker was dropped", () => {
    expect(sanitizeOutput("seen in X and .")).toBe("seen in X.");
    expect(sanitizeOutput("seen in X and , then")).toBe("seen in X, then");
    expect(sanitizeOutput("films like , and Y")).toBe("films like Y");
  });

  it("leaves ordinary text untouched", () => {
    const t = "## The read\n\nA two-hander in a kitchen. Ordinary prose, no money.\n\n- one\n- two\n";
    expect(sanitizeOutput(t)).toBe(t);
  });
});

describe("createSentenceSanitizer (streaming)", () => {
  it("only releases text up to the last sentence boundary, and everything on flush", () => {
    const s = createSentenceSanitizer();
    expect(s.push("First sentence. Second sen")).toBe("First sentence. ");
    expect(s.push(`tence ${EM} with dash. Third`)).toBe("Second sentence, with dash. ");
    expect(s.flush()).toBe("Third");
  });

  it("treats a newline as a boundary so headings and bullets flow promptly", () => {
    const s = createSentenceSanitizer();
    expect(s.push("## The read\n- Beat one\n- Beat")).toBe("## The read\n- Beat one\n");
    expect(s.flush()).toBe("- Beat");
  });

  it("drops a money sentence that arrived across chunks", () => {
    const s = createSentenceSanitizer();
    const out = s.push("Keep. This costs Rs ") + s.push("5 lakh. Also keep.") + s.flush();
    expect(out).toBe("Keep. Also keep.");
  });
});
