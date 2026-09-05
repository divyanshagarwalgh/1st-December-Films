/** Post-processing that no model output escapes: dashes become commas, money sentences vanish. */
const EM = String.fromCharCode(8212);
const EN = String.fromCharCode(8211);
const DASH = new RegExp(`\\s*[${EM}${EN}]\\s*`, "g");
export const MONEY = /₹|\bRs\.?\s?\d|\bINR\b|\blakhs?\b|\bcrores?\b|\brupees?\b/i;

function stripMoneySentences(text: string): string {
  // Work line by line so bullets and headings stay intact; within a line, drop offending sentences.
  return text
    .split("\n")
    .map((line) => {
      if (!MONEY.test(line)) return line;
      const bullet = line.match(/^(\s*(?:[-*]|\d+\.)\s+)/);
      if (bullet) return null; // a bullet that talks money goes entirely
      const sentences = line.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [line];
      const kept = sentences.filter((s) => !MONEY.test(s)).join("");
      return kept.trim() ? kept.replace(/\s+$/, "") + (line.endsWith(" ") ? " " : "") : null;
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}

export function sanitizeOutput(text: string): string {
  let t = text.replace(DASH, ", ");
  t = stripMoneySentences(t);
  t = t.replace(/\s*\[\[\s*/g, " ").replace(/\s*\]\]\s*/g, " ");
  // A dropped marker can leave "and ." or ", and" behind; tidy the common shapes.
  t = t
    .replace(/\s+(?:and|or)\s*([.,;])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/(^|\s)like\s*,\s*(?:and\s+)?/g, "$1like ")
    .replace(/\s+([.,;:])/g, "$1");
  t = t.replace(/ {2,}/g, " ").replace(/ +\n/g, "\n").trim();
  return t === text.trim() ? text : t;
}

/** Streaming variant: releases text only up to the last sentence or line boundary. */
export function createSentenceSanitizer() {
  let buf = "";
  const boundary = /[.!?]\s+|\n/g;
  return {
    push(chunk: string): string {
      buf += chunk;
      let last = -1;
      let m: RegExpExecArray | null;
      boundary.lastIndex = 0;
      while ((m = boundary.exec(buf)) !== null) last = m.index + m[0].length;
      if (last === -1) return "";
      const ready = buf.slice(0, last);
      buf = buf.slice(last);
      const out = sanitizeOutput(ready);
      if (!out) return "";
      return out.endsWith("\n") || ready.endsWith("\n") ? (out.endsWith("\n") ? out : out + "\n") : out.endsWith(" ") ? out : out + " ";
    },
    flush(): string {
      const out = sanitizeOutput(buf);
      buf = "";
      return out;
    },
  };
}
