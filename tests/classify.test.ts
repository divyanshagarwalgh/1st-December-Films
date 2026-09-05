import { describe, it, expect } from "vitest";
import { classifyInput, extractHints } from "../src/lib/classify";

const script = `
TITLE: THE LAST OVER

OPEN ON a dusty maidan at dawn. A boy, 12, bowls at a single stump.

VO: Every yard counts.

CUT TO: INT. KITCHEN - MORNING. Mother packs a tiffin.

MOTHER: You will be late again.
BOY: Not today.

SFX: a bat cracks. SUPER: Make every yard count.

CUT TO: EXT. STADIUM - NIGHT. Floodlights. A crowd of thousands.

VO: When the country bowls, the country wins.

CLOSE ON the boy's face. Product shot: the new boot. End card.
`.repeat(3);

const brief = `
Brand: Fiama. Objective: launch the new shower gel range to women 22 to 35 in metro India.
Target audience: working women who see the shower as the one calm moment in the day.
Key message: fragrance that lifts your mood. Tone of voice: warm, light, a little playful.
Deliverables: one 30 second TVC, three 15 second cutdowns for digital, vertical edits for Instagram.
Platforms: TV, YouTube, Instagram. Timeline: on air by Diwali. Mandatories: pack shot, new logo.
`;

const notAScript = `
We are hiring a senior accountant with five years of experience in GST filing and audit support.
Responsibilities include ledger reconciliation, vendor payments and quarterly reporting. Apply with CV.
Salary as per industry standards. Location Andheri East. Immediate joiners preferred. Contact HR at the office.
`;

describe("classifyInput", () => {
  it("recognises a screenplay-style script", () => {
    const r = classifyInput(script);
    expect(r.kind).toBe("script");
  });

  it("recognises a creative brief", () => {
    const r = classifyInput(brief);
    expect(r.kind).toBe("brief");
  });

  it("returns unknown for text that is neither", () => {
    expect(classifyInput(notAScript).kind).toBe("unknown");
  });

  it("returns unknown for inputs under 40 words", () => {
    expect(classifyInput("VO: Buy now. CUT TO: logo.").kind).toBe("unknown");
  });

  it("explains its decision", () => {
    expect(classifyInput(script).reasons.length).toBeGreaterThan(0);
  });
});

describe("extractHints", () => {
  it("finds industry, flags and celebrity cues in a script", () => {
    const h = extractHints(script + " Featuring Virat Kohli as himself. The car drifts through the rain.");
    expect(h.industry).toContain("Sportswear & Athletic");
    expect(h.flags).toEqual(expect.arrayContaining(["sport", "crowd", "night", "kids"]));
    expect(h.celebrity).toBe(true);
  });

  it("finds the format from the brief's deliverables", () => {
    const h = extractHints(brief);
    expect(h.format).toBe("TVC");
    expect(h.festive).toBe(true);
    expect(h.industry).toContain("FMCG");
  });

  it("returns empty hints for a plain text", () => {
    const h = extractHints("A quiet story about two friends talking on a bench.");
    expect(h.industry).toEqual([]);
    expect(h.flags).toEqual([]);
    expect(h.format).toBeNull();
    expect(h.celebrity).toBe(false);
  });
});
