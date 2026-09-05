/**
 * The citation guardrail.
 *
 * The model never writes a film's name. It writes [[work:<id>]] and [[director:<slug>]].
 * This module rewrites those markers into links using ONLY the rows the server looked up
 * in D1 for this request. Any id or slug outside that set is dropped: no link, no title,
 * no id survives into the client's text. A fabricated FDF film is therefore impossible.
 */
export type WorkRef = { id: string; slug: string; client: string | null; campaign: string | null; year: string | null };
export type DirectorRef = { slug: string; name: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True when `a` is the same brand as `b` allowing spelling drift ("Malaysia" vs "Malaysian", "Muscle Blaze" vs "MuscleBlaze"). */
function sameBrand(a: string, b: string): boolean {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  const n = Math.min(x.length, y.length, 8);
  return n >= 4 && x.slice(0, n) === y.slice(0, n);
}

export function renderWorkRef(w: WorkRef, origin: string): string {
  const client = (w.client || "").trim();
  let campaign = (w.campaign || "").trim();
  // "Brand | Film" or "Brand : Film" inside the campaign: drop the brand segment.
  const seg = campaign.split(/\s+[|:]\s+/);
  if (seg.length > 1 && sameBrand(seg[0], client)) campaign = seg.slice(1).join(" ").trim();
  const repeats = client && norm(campaign).startsWith(norm(client));
  const label = repeats ? campaign : [client, campaign].filter(Boolean).join(", ");
  const year = w.year ? String(w.year).slice(0, 4) : "";
  return `<a href="${origin}/work/${esc(w.slug)}">${esc(label)}${year ? ` (${esc(year)})` : ""}</a>`;
}

export function renderDirectorRef(d: DirectorRef, origin: string): string {
  return `<a href="${origin}/director/${esc(d.slug)}">${esc(d.name)}</a>`;
}

const MARK = /\[\[(work|director):([A-Za-z0-9_-]+)\]\]/g;

export type RefRewriter = {
  push(chunk: string): string;
  flush(): string;
  readonly cited: string[];
  readonly droppedWorks: string[];
  readonly suggestedDirectors: string[];
  readonly droppedDirectors: string[];
};

export function createRefRewriter(opts: { works: Map<string, WorkRef>; directors: Map<string, DirectorRef>; origin: string }): RefRewriter {
  const { works, directors, origin } = opts;
  let buf = "";
  const cited: string[] = [];
  const droppedWorks: string[] = [];
  const suggestedDirectors: string[] = [];
  const droppedDirectors: string[] = [];
  const add = (list: string[], v: string) => {
    if (!list.includes(v)) list.push(v);
  };

  function render(s: string): string {
    return s.replace(MARK, (_m, kind: string, key: string) => {
      if (kind === "work") {
        const w = works.get(key);
        if (!w) {
          add(droppedWorks, key);
          return "";
        }
        add(cited, key);
        return renderWorkRef(w, origin);
      }
      const d = directors.get(key);
      if (!d) {
        add(droppedDirectors, key);
        return "";
      }
      add(suggestedDirectors, key);
      return renderDirectorRef(d, origin);
    });
  }

  /** Index at which a possibly unfinished marker begins, or -1. */
  function pendingStart(s: string): number {
    const open = s.lastIndexOf("[[");
    let cut = -1;
    if (open !== -1 && s.indexOf("]]", open) === -1) cut = open;
    else if (s.endsWith("[")) cut = s.length - 1;
    while (cut > 0 && s[cut - 1] === "[") cut--;
    return cut;
  }

  return {
    push(chunk: string) {
      buf += chunk;
      const cut = pendingStart(buf);
      const ready = cut === -1 ? buf : buf.slice(0, cut);
      buf = cut === -1 ? "" : buf.slice(cut);
      return render(ready);
    },
    flush() {
      const out = render(buf).replace(/\[\[?[^\]]*$/, "");
      buf = "";
      return out;
    },
    get cited() {
      return cited;
    },
    get droppedWorks() {
      return droppedWorks;
    },
    get suggestedDirectors() {
      return suggestedDirectors;
    },
    get droppedDirectors() {
      return droppedDirectors;
    },
  };
}
