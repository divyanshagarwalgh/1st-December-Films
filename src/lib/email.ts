/** Lead notification email: recipient parsing, message building, and provider-agnostic sending. */
import { escapeHtml } from "./render";

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "a@x.com, b@ and c@" -> ["a@x.com", "b@x.com", "c@x.com"]. Tolerant of shorthand typed into a dashboard field. */
export function parseRecipients(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[,;\n]|\s+and\s+|\s+&\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const firstDomain = parts.map((p) => p.match(/@([^\s@]+\.[^\s@]{2,})$/)?.[1]).find(Boolean);
  const out: string[] = [];
  for (let p of parts) {
    if (/^[^\s@]+@$/.test(p) && firstDomain) p = p + firstDomain;
    if (ADDRESS.test(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

export type NotificationInput = {
  id: string;
  email: string;
  company: string | null;
  kind: string;
  complexity: string | null;
  cited: string[];
  directors: string[];
  attribution: Record<string, string>;
  resultUrl: string;
  inputText: string;
};

export type Message = { subject: string; text: string; html: string; replyTo?: string };

export function buildNotification(n: NotificationInput): Message {
  const who = n.company || n.email;
  const ref = n.id.slice(0, 8);
  const band = n.complexity ? `, ${n.complexity}` : "";
  const subject = `Script enquiry: ${who} (${n.kind}${band})`;
  const attrLines = Object.entries(n.attribution)
    .filter(([k, v]) => v && !["ip_hash", "ua"].includes(k))
    .map(([k, v]) => `${k}: ${v}`);
  const lines = [
    `New ${n.kind} through the script analyser.`,
    "",
    `From: ${n.email}${n.company ? ` (${n.company})` : ""}`,
    `Reference ${ref}`,
    `Analysis: ${n.resultUrl}`,
    n.complexity ? `Complexity: ${n.complexity}` : null,
    "",
    "Comparable films offered:",
    ...(n.cited.length ? n.cited.map((c) => `  ${c}`) : ["  none"]),
    "",
    "Directors suggested:",
    ...(n.directors.length ? n.directors.map((d) => `  ${d}`) : ["  none"]),
    "",
    "Attribution:",
    ...(attrLines.length ? attrLines.map((l) => `  ${l}`) : ["  none recorded"]),
    "",
    "The script or brief as pasted:",
    "",
    n.inputText,
  ].filter((l): l is string => l !== null);
  const text = lines.join("\n");
  const html = [
    `<p>New ${escapeHtml(n.kind)} through the script analyser.</p>`,
    `<p><strong>From:</strong> ${escapeHtml(n.email)}${n.company ? ` (${escapeHtml(n.company)})` : ""}<br>`,
    `<strong>Reference</strong> ${escapeHtml(ref)}<br>`,
    `<strong>Analysis:</strong> <a href="${escapeHtml(n.resultUrl)}">${escapeHtml(n.resultUrl)}</a>`,
    n.complexity ? `<br><strong>Complexity:</strong> ${escapeHtml(n.complexity)}` : "",
    `</p>`,
    `<p><strong>Comparable films offered</strong><br>${n.cited.length ? n.cited.map(escapeHtml).join("<br>") : "none"}</p>`,
    `<p><strong>Directors suggested</strong><br>${n.directors.length ? n.directors.map(escapeHtml).join("<br>") : "none"}</p>`,
    `<p><strong>Attribution</strong><br>${attrLines.length ? attrLines.map(escapeHtml).join("<br>") : "none recorded"}</p>`,
    `<p><strong>The script or brief as pasted</strong></p>`,
    `<pre style="white-space:pre-wrap;font-family:inherit;border-left:2px solid #20201e;padding-left:12px">${escapeHtml(n.inputText)}</pre>`,
  ].join("\n");
  return { subject, text, html, replyTo: n.email };
}

export type EmailEnv = {
  EMAIL_PROVIDER?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  NOTIFY_TO?: string;
};

export type SendResult = { ok: boolean; provider: string; status?: number; detail?: string; to: string[]; from?: string; fallback?: boolean };

export type VerifiedSender = { email: string; active?: boolean };

/** Use the wanted sender if the provider has verified it, else the first active verified one. */
export function pickSender(wanted: string, verified: VerifiedSender[] | null): { email: string; fallback: boolean } {
  if (!verified) return { email: wanted, fallback: false };
  const w = wanted.trim().toLowerCase();
  const hit = verified.find((v) => v.email.toLowerCase() === w && v.active !== false);
  if (hit) return { email: hit.email, fallback: false };
  const first = verified.find((v) => v.active !== false);
  return first ? { email: first.email, fallback: true } : { email: wanted, fallback: false };
}

async function brevoVerifiedSenders(apiKey: string, signal: AbortSignal): Promise<VerifiedSender[] | null> {
  try {
    const r = await fetch("https://api.brevo.com/v3/senders", { headers: { "api-key": apiKey, accept: "application/json" }, signal });
    if (!r.ok) return null;
    const j = (await r.json()) as { senders?: VerifiedSender[] };
    return Array.isArray(j.senders) ? j.senders : null;
  } catch {
    return null;
  }
}

/** Sends through Brevo, Resend, or a JSON webhook. Never throws; the caller logs the result. */
export async function sendEmail(env: EmailEnv, msg: Message): Promise<SendResult> {
  const provider = (env.EMAIL_PROVIDER || "").toLowerCase();
  const to = parseRecipients(env.NOTIFY_TO);
  const from = (env.EMAIL_FROM || "").trim();
  if (!provider) return { ok: false, provider: "none", detail: "EMAIL_PROVIDER not set", to };
  if (!to.length) return { ok: false, provider, detail: "NOTIFY_TO has no valid address", to };
  if (!env.EMAIL_API_KEY) return { ok: false, provider, detail: "EMAIL_API_KEY not set", to };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    let res: Response;
    let sender = { email: from, fallback: false };
    if (provider === "brevo") {
      sender = pickSender(from, await brevoVerifiedSenders(env.EMAIL_API_KEY, ctl.signal));
      res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": env.EMAIL_API_KEY, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: { email: sender.email, name: "First December Films script analyser" },
          to: to.map((email) => ({ email })),
          replyTo: msg.replyTo ? { email: msg.replyTo } : undefined,
          subject: msg.subject,
          textContent: msg.text,
          htmlContent: msg.html,
        }),
        signal: ctl.signal,
      });
    } else if (provider === "resend") {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.EMAIL_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to, reply_to: msg.replyTo, subject: msg.subject, text: msg.text, html: msg.html }),
        signal: ctl.signal,
      });
    } else if (provider === "webhook") {
      res = await fetch(env.EMAIL_API_KEY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ from, to, replyTo: msg.replyTo, subject: msg.subject, text: msg.text, html: msg.html }),
        signal: ctl.signal,
      });
    } else {
      return { ok: false, provider, detail: "unknown EMAIL_PROVIDER", to };
    }
    const detail = (await res.text()).slice(0, 300);
    return { ok: res.ok, provider, status: res.status, detail, to, from: sender.email, fallback: sender.fallback };
  } catch (e) {
    return { ok: false, provider, detail: String(e).slice(0, 300), to };
  } finally {
    clearTimeout(timer);
  }
}
