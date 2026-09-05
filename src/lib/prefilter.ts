/** Loose SQL pre-filter over the works table, widening until at least `minimum` candidates. */
import type { Hints } from "./classify";
import type { WorkRow } from "./db";

export type CandidateQuery = { sql: string; params: unknown[]; step: string };

const BASE = "SELECT * FROM works WHERE is_published = 1";
const ORDER = " ORDER BY confidence DESC, has_case_study DESC, year DESC";
const BEST = `${BASE}${ORDER} LIMIT 161`;

export function buildCandidateQueries(h: Hints): CandidateQuery[] {
  const q: CandidateQuery[] = [];
  const ind = h.industry.map(() => "industry LIKE ?").join(" OR ");
  const indParams = h.industry.map((i) => `%${i}%`);
  if (h.industry.length && h.format) {
    q.push({ step: "industry+format", sql: `${BASE} AND (${ind}) AND format = ?${ORDER}`, params: [...indParams, h.format] });
  }
  if (h.industry.length) {
    q.push({ step: "industry", sql: `${BASE} AND (${ind})${ORDER}`, params: indParams });
  }
  const attrs: string[] = [];
  const attrParams: unknown[] = [];
  for (const f of h.flags) {
    attrs.push("flags LIKE ?");
    attrParams.push(`%"${f}"%`);
  }
  if (h.celebrity) attrs.push("celebrity IS NOT NULL");
  if (h.festive) {
    attrs.push("brief_type = ?");
    attrParams.push("festive");
  }
  if (h.format) {
    attrs.push("format = ?");
    attrParams.push(h.format);
  }
  if (attrs.length) {
    q.push({ step: "attributes", sql: `${BASE} AND (${attrs.join(" OR ")})${ORDER}`, params: attrParams });
  }
  q.push({ step: "all", sql: BEST, params: [] });
  return q;
}

export const CANDIDATE_CAP = 90;
const ALWAYS_BEST = 12;

export async function selectCandidates(db: D1Database, hints: Hints, minimum = 40): Promise<WorkRow[]> {
  const steps = buildCandidateQueries(hints);
  const byId = new Map<string, WorkRow>();
  let usedStep = "all";
  for (const s of steps) {
    const r = await db.prepare(s.sql).bind(...s.params).all<WorkRow>();
    for (const row of r.results) if (!byId.has(row.id)) byId.set(row.id, row);
    usedStep = s.step;
    if (byId.size >= minimum) break;
  }
  if (usedStep !== "all") {
    const best = await db.prepare(BEST).bind().all<WorkRow>();
    for (const row of best.results.slice(0, ALWAYS_BEST)) if (!byId.has(row.id)) byId.set(row.id, row);
  }
  const rows = [...byId.values()];
  rows.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "high" ? -1 : b.confidence === "high" ? 1 : a.confidence === "medium" ? -1 : 1));
  const capped = rows.slice(0, CANDIDATE_CAP);
  capped.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return capped;
}
