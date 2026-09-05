/**
 * One streaming Claude call, teed through the guardrail pipeline:
 *   model text -> protocol parser -> HTML escape -> ref rewriter -> sentence sanitiser -> HTML renderer
 */
import Anthropic from "@anthropic-ai/sdk";
import type { DirectorRow, WorkRow } from "./db";
import { createOutputParser, type OutputKind } from "./protocol";
import { createRefRewriter } from "./refs";
import { createSentenceSanitizer, sanitizeOutput } from "./sanitize";
import { createHtmlRenderer, escapeHtml } from "./render";
import { buildCandidateBlock, buildUserMessage, MODEL, SYSTEM_PROMPT } from "./prompt";

export type AnalysisEvents = {
  onKind: (kind: OutputKind) => void;
  onHtml: (html: string) => void;
  onSection: (name: string) => void;
};

export type AnalysisResult = {
  kind: OutputKind;
  rawText: string;
  html: string;
  extracted: unknown;
  cited: string[];
  directors: string[];
  droppedWorks: string[];
  droppedDirectors: string[];
  usage: unknown;
  stopReason: string | null;
};

export class AnalysisRefused extends Error {}

export async function runAnalysis(opts: {
  apiKey: string;
  input: string;
  hint: string;
  works: WorkRow[];
  /** Rows the rewriter may render: the candidate works plus the directors' credit rows. */
  allowed: WorkRow[];
  directors: DirectorRow[];
  origin: string;
  events: AnalysisEvents;
  signal?: AbortSignal;
}): Promise<AnalysisResult> {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1, timeout: 120_000 });
  const parser = createOutputParser();
  const rewriter = createRefRewriter({
    works: new Map(opts.allowed.map((w) => [w.id, w])),
    directors: new Map(opts.directors.map((d) => [d.slug, d])),
    origin: opts.origin,
  });
  const sanitizer = createSentenceSanitizer();
  const renderer = createHtmlRenderer();
  let rawText = "";
  let html = "";
  let kindSent = false;

  const step = (text: string, sections: string[], final = false) => {
    if (parser.kind && !kindSent) {
      kindSent = true;
      opts.events.onKind(parser.kind);
    }
    for (const s of sections) opts.events.onSection(s);
    if (!text && !final) return;
    let t = rewriter.push(escapeHtml(text));
    if (final) t += rewriter.flush();
    let s = sanitizer.push(t);
    if (final) s += sanitizer.flush();
    let h = renderer.push(s);
    if (final) h += renderer.flush();
    if (h) {
      html += h;
      opts.events.onHtml(h);
    }
  };

  const stream = client.messages.stream(
    {
      model: MODEL,
      max_tokens: 12000,
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
        { type: "text", text: buildCandidateBlock(opts.works, opts.directors), cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: buildUserMessage(opts.input, opts.hint) }],
    },
    { signal: opts.signal },
  );

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      rawText += event.delta.text;
      const { visible, sections } = parser.push(event.delta.text);
      step(visible, sections);
    }
  }
  const final = await stream.finalMessage();
  const tail = parser.flush();
  step(tail.visible, tail.sections, true);
  if (final.stop_reason === "refusal") throw new AnalysisRefused("The model declined this input.");

  return {
    kind: parser.kind ?? "unknown",
    rawText: sanitizeOutput(rawText),
    html,
    extracted: parser.extracted,
    cited: rewriter.cited,
    directors: rewriter.suggestedDirectors,
    droppedWorks: rewriter.droppedWorks,
    droppedDirectors: rewriter.droppedDirectors,
    usage: final.usage,
    stopReason: final.stop_reason,
  };
}
