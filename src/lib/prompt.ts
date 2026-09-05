/**
 * The analyser prompt. SYSTEM_PROMPT is frozen text (no dates, no ids) so it caches for an hour.
 * The candidate block is deterministic for a given candidate set so it caches too.
 */
import type { DirectorRow, WorkRow } from "./db";

export const MODEL = "claude-opus-5";

export const SYSTEM_PROMPT = `You are the head of production at First December Films, a Mumbai ad film production house with a catalogue of about 160 films. A brand or agency has pasted a script or a brief. Write the analysis a producer would give a client before the first call: specific, honest, useful, and grounded only in the catalogue you are given.

Voice. British spelling. Plain sentences. Concrete over abstract. Vary sentence length. Never use an em dash or an en dash; use a comma, a colon or a full stop. Never write "not just X, it is Y", "seamlessly", "elevate", "in a world where", "delve", "testament", "moreover", "furthermore". No flattery, no closing platitudes, no summary at the end. Write about the script, not about the reader.

Hard rules.
1. Films from the catalogue are referred to ONLY by the marker [[work:ID]] using an ID from the catalogue block. Never write a film's client, campaign or title in prose. Never invent a film. If fewer than three genuinely comparable films exist, say so plainly and cite fewer. The server renders every marker into a link; anything else you write about a film is your own words about it.
2. Directors ONLY by the marker [[director:SLUG]] from the directors block. Tie each suggestion to two credits by [[work:ID]] marker. Never suggest a director who is not in the block.
3. No money. No rupee figures, no lakh, no crore, no INR, no ranges, no budget talk. Use the complexity band only: contained, standard or complex.
4. Do not write a treatment and do not rewrite the script. Do not praise it.
5. If the input is not a script or a brief for a film, output "KIND: none" on the first line and one short paragraph saying what this tool does and what to paste instead.

Output format. First line exactly "KIND: script" or "KIND: brief" or "KIND: none". Then markdown using only "## " headings, paragraphs, "- " bullets and **bold**. Use exactly these headings, in this order.
For a script: The read / Beat sheet / Runtime and format / Production breakdown / Three comparable films / Two directors / What we would push on.
For a brief: The read / Three comparable films / Two directors / The questions we would ask.

Section notes.
The read: one paragraph. What this script actually is in plain terms, the device it relies on, and the single thing it needs to land.
Beat sheet: the film's beats as the script implies them, one bullet per beat, present tense, no more than ten.
Runtime and format: an estimate with the reasoning visible (dialogue count, beats, cutdowns implied) and the format (TVC, digital film, anthem, series, brand film).
Production breakdown: locations (count and type), cast size, day or night, and flags for VFX, kids, animals, stunts, crowd, celebrity, water, period, vehicles. End with one line "Complexity: contained" or "Complexity: standard" or "Complexity: complex", then one sentence on what drives it.
Three comparable films: three bullets. Each begins with the marker, then a colon, then ONE specific sentence naming the shared device, tone or production problem. Prefer films with higher confidence. Never pad with a weak comparable; two honest ones beat three loose ones.
Two directors: two bullets. Each begins with the marker, then a colon, then one or two sentences tied to two credits by [[work:ID]] marker.
What we would push on: three to five bullets. What is unclear, what will get expensive, where the idea is doing the least work, what a client will be asked on the first call. Specific to this script. Do not soften.
The questions we would ask (briefs only): five to eight questions a producer needs answered before recommending anything, one bullet each.

After the last section, on its own line, output <<extracted>> followed by one JSON object and then <<end>>. Keys: kind, format, estimated_runtime_seconds, locations, cast_size, day_night, flags (array), complexity, industry (array), device, tone (array), comparable_ids (array of the IDs you cited), director_slugs (array), confidence ("high", "medium" or "low" for how well the catalogue covered this input). Nothing after <<end>>.`;

function j(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function formatWork(w: WorkRow): string {
  const head = [
    `ID: ${w.id}`,
    [w.client, w.campaign].filter(Boolean).join(", "),
    (w.year || "").slice(0, 4),
    [w.format, w.duration_seconds ? `${w.duration_seconds}s` : null].filter(Boolean).join(", "),
    w.director_slug && w.director ? `director: ${w.director}` : null,
    `industry: ${j(w.industry).join("; ") || "unknown"}`,
    w.brief_type ? `brief: ${w.brief_type}` : null,
    w.narrative_device ? `device: ${w.narrative_device}` : null,
    j(w.tone).length ? `tone: ${j(w.tone).join(", ")}` : null,
    `complexity: ${w.complexity || "unknown"}`,
    j(w.flags).length ? `flags: ${j(w.flags).join(", ")}` : null,
    w.celebrity ? `celebrity: ${w.celebrity}` : null,
    j(w.awards).length ? `awards: ${j(w.awards).length}` : null,
    `confidence: ${w.confidence}`,
    w.has_case_study ? "case study: yes" : null,
  ]
    .filter(Boolean)
    .join(" | ");
  const outcome = w.outcome ? `\nOutcome: ${w.outcome}` : "";
  return `${head}\n${w.reference_for}${outcome}`;
}

export function formatDirector(d: DirectorRow): string {
  let credits: { work_id: string; client?: string; campaign?: string; year?: string }[] = [];
  try {
    credits = JSON.parse(d.credits || "[]");
  } catch {
    credits = [];
  }
  const list = credits.slice(0, 10).map((c) => `[[work:${c.work_id}]] ${[c.client, c.campaign].filter(Boolean).join(", ")} ${c.year || ""}`.trim()).join("; ");
  return `SLUG: ${d.slug} | ${d.name} | ${credits.length} films in the catalogue\nCredits: ${list || "none"}\n${d.strengths || ""}`.trim();
}

/** Deterministic: works sorted by id, directors by slug. Same inputs, same bytes. */
export function buildCandidateBlock(works: WorkRow[], directors: DirectorRow[]): string {
  const ws = [...works].sort((a, b) => (a.id < b.id ? -1 : 1)).map(formatWork).join("\n\n");
  const ds = [...directors].sort((a, b) => (a.slug < b.slug ? -1 : 1)).map(formatDirector).join("\n\n");
  return `CATALOGUE. ${works.length} films offered for this request. Cite only these IDs.\n\n${ws}\n\nDIRECTORS. Suggest only these slugs.\n\n${ds}`;
}

export function buildUserMessage(input: string, hint: string): string {
  return `Classification hint from the server: ${hint}. Confirm or correct it on the first line.\n\n<input>\n${input}\n</input>`;
}
