export const config = { runtime: "edge" };
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { classifyInput, extractHints, wordCount } from "../../lib/classify";
import { selectCandidates } from "../../lib/prefilter";
import { getLiveDirectors, getWorksByIds, insertEnquiry, updateEnquiryOutput, type WorkRow } from "../../lib/db";
import { rateLimit, sha256Hex } from "../../lib/ratelimit";
import { validateAttribution } from "../../lib/attribution";
import { runAnalysis, classifyFailure } from "../../lib/analyse";
import { checkAdmin } from "../../lib/auth";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const MAX_WORDS = 12000;
const MIN_WORDS = 40;

type Body = { email?: unknown; company?: unknown; text?: unknown; attribution?: unknown; website?: unknown };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export const POST: APIRoute = async ({ request, locals }) => {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json(400, { code: "bad_json", message: "Send JSON." });
  }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const company = typeof body.company === "string" ? body.company.trim().slice(0, 200) : null;
  const text = typeof body.text === "string" ? body.text.replace(/\r\n/g, "\n").trim() : "";
  if (typeof body.website === "string" && body.website.length) return json(400, { code: "spam", message: "Rejected." });
  if (!EMAIL.test(email)) return json(400, { code: "bad_email", message: "Enter a working email address." });
  const words = wordCount(text);
  if (words < MIN_WORDS) return json(422, { code: "too_short", message: "Paste the whole script or brief. This needs at least a few paragraphs to work with." });
  if (words > MAX_WORDS) return json(422, { code: "too_long", message: "That is longer than a script. Paste one script or one brief, up to about 12,000 words." });
  if (!env.ANTHROPIC_API_KEY) return json(503, { code: "not_configured", message: "The analyser is not configured yet." });

  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const isAdmin = checkAdmin(request, env.ADMIN_TOKEN);
  if (!isAdmin) {
    const rl = await rateLimit(env.RATE, email, ip);
    if (!rl.allowed) {
      return json(429, {
        code: "rate_limited",
        message: rl.reason === "email" ? "Three analyses per email address per day. Email us if you need more." : "Too many requests from this connection today.",
      });
    }
  }

  const cls = classifyInput(text);
  if (cls.kind === "unknown" && words < 120) {
    return json(422, { code: "not_a_script", message: "This does not read as a script or a brief. Paste scene directions, voice-over and dialogue, or a one-page brief." });
  }
  const hints = extractHints(text);
  const [works, directors] = await Promise.all([selectCandidates(env.DB, hints, 40), getLiveDirectors(env.DB)]);
  // The directors block offers credit ids too; those rows join the allowed set so a legitimate
  // credit citation renders. Every allowed row still comes from D1, never from the model.
  const creditIds = new Set<string>();
  for (const d of directors) {
    try {
      for (const c of JSON.parse(d.credits || "[]") as { work_id: string }[]) creditIds.add(c.work_id);
    } catch {
      /* ignore malformed credits */
    }
  }
  const known = new Set(works.map((w) => w.id));
  const extra: WorkRow[] = await getWorksByIds(env.DB, [...creditIds].filter((id) => !known.has(id)));
  const allowed = [...works, ...extra.filter((w) => w.is_published)];
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const attribution = validateAttribution(body.attribution);
  await insertEnquiry(env.DB, {
    id,
    created_at: createdAt,
    email,
    company,
    input_kind: cls.kind,
    input_text: text,
    input_hash: await sha256Hex(text),
    candidate_ids: JSON.stringify(allowed.map((w) => w.id)),
    attribution: JSON.stringify({ ...attribution, ip_hash: (await sha256Hex(ip)).slice(0, 16), ua: (request.headers.get("user-agent") || "").slice(0, 200) }),
  });

  const origin = env.SITE_ORIGIN || "https://1stdecember.com";
  const enc = new TextEncoder();
  const started = Date.now();
  const cfContext = locals.cfContext;

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (event: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      let gotText = false;
      send("meta", { id, kind: cls.kind, candidates: works.length });
      const ping = setInterval(() => {
        if (!gotText) ctrl.enqueue(enc.encode(": ping\n\n"));
      }, 5000);
      try {
        const result = await runAnalysis({
          apiKey: env.ANTHROPIC_API_KEY!,
          input: text,
          hint: cls.kind,
          works,
          allowed,
          directors,
          origin,
          events: {
            onKind: (kind) => send("kind", { kind }),
            onSection: (name) => send("section", { key: name }),
            onHtml: (html) => {
              gotText = true;
              send("delta", { html });
            },
          },
          signal: request.signal,
        });
        clearInterval(ping);
        const durationMs = Date.now() - started;
        const u = (result.usage ?? {}) as { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number };
        send("done", {
          id,
          kind: result.kind,
          cited: result.cited,
          directors: result.directors,
          ms: durationMs,
          usage: { input: u.input_tokens ?? 0, cache_write: u.cache_creation_input_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 },
        });
        cfContext.waitUntil(
          updateEnquiryOutput(env.DB, id, {
            input_kind: result.kind === "none" ? "none" : result.kind === "unknown" ? cls.kind : result.kind,
            extracted: result.extracted ? JSON.stringify(result.extracted) : null,
            cited_ids: JSON.stringify(result.cited),
            suggested_directors: JSON.stringify(result.directors),
            output_text: result.html,
            token_usage: JSON.stringify({ ...(result.usage as object), dropped_works: result.droppedWorks, dropped_directors: result.droppedDirectors, stop: result.stopReason }),
            duration_ms: durationMs,
            status: result.kind === "none" ? "spam" : "new",
          }).catch((e) => console.error(JSON.stringify({ at: "enquiry.update", id, error: String(e) }))),
        );
      } catch (e) {
        clearInterval(ping);
        const failure = classifyFailure(e);
        console.error(JSON.stringify({ at: "analyse", id, code: failure.code, status: failure.status, error: String(e).slice(0, 500) }));
        send("error", { code: failure.code, message: failure.message });
        cfContext.waitUntil(updateEnquiryOutput(env.DB, id, { status: "error", token_usage: JSON.stringify({ error: failure.code, status: failure.status }), duration_ms: Date.now() - started }).catch(() => {}));
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
      "x-robots-tag": "noindex",
    },
  });
};
