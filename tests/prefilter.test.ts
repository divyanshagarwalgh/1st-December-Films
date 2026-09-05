import { describe, it, expect } from "vitest";
import { buildCandidateQueries, selectCandidates } from "../src/lib/prefilter";

function fakeDb(rowsByStep: Record<string, any[]>) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...params: unknown[]) {
          return {
            async all() {
              calls.push({ sql, params });
              const key = Object.keys(rowsByStep).find((k) => sql.includes(k)) ?? "default";
              return { results: rowsByStep[key] ?? rowsByStep.default ?? [] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}

const row = (id: string, confidence = "medium", cs = 0) => ({ id, slug: id, client: "X", campaign: "Y", year: "2024", confidence, has_case_study: cs, is_published: 1 });

describe("buildCandidateQueries", () => {
  it("starts narrow on industry and format and ends with the whole published catalogue", () => {
    const q = buildCandidateQueries({ industry: ["Automotive & Auto Marketplaces"], format: "TVC", flags: ["vehicle"], celebrity: false, festive: false });
    expect(q[0].sql).toMatch(/industry LIKE \?/);
    expect(q[0].sql).toMatch(/format = \?/);
    expect(q[0].params).toEqual(["%Automotive & Auto Marketplaces%", "TVC"]);
    expect(q[q.length - 1].sql).toMatch(/WHERE is_published = 1 ORDER BY/);
    expect(q[q.length - 1].params).toEqual([]);
  });

  it("only emits steps that have something to filter on", () => {
    const q = buildCandidateQueries({ industry: [], format: null, flags: [], celebrity: false, festive: false });
    expect(q.length).toBe(1);
    expect(q[0].sql).toMatch(/WHERE is_published = 1/);
  });

  it("never selects unpublished rows in any step", () => {
    const q = buildCandidateQueries({ industry: ["FMCG"], format: "digital film", flags: ["kids"], celebrity: true, festive: true });
    for (const step of q) expect(step.sql).toMatch(/is_published = 1/);
  });
});

describe("selectCandidates", () => {
  it("widens until at least the minimum and always unions the best-documented films", async () => {
    const narrow = [row("n1"), row("n2")];
    const wide = Array.from({ length: 45 }, (_, i) => row("w" + i));
    const best = [row("b1", "high", 1), row("b2", "high", 1), row("n1")];
    const { db, calls } = fakeDb({ "format = ?": narrow, "industry LIKE ?": narrow, "ORDER BY confidence DESC": [...best, ...wide] });
    const out = await selectCandidates(db, { industry: ["FMCG"], format: "TVC", flags: [], celebrity: false, festive: false }, 40);
    expect(out.length).toBeGreaterThanOrEqual(40);
    expect(out.map((r) => r.id)).toContain("b1");
    expect(new Set(out.map((r) => r.id)).size).toBe(out.length);
    expect(calls.length).toBeGreaterThan(1);
  });

  it("returns rows sorted by id so the prompt block is byte-stable", async () => {
    const rows = ["c", "a", "b"].map((id) => row(id));
    const { db } = fakeDb({ default: rows });
    const out = await selectCandidates(db, { industry: [], format: null, flags: [], celebrity: false, festive: false }, 2);
    expect(out.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("caps the candidate set at 90", async () => {
    const rows = Array.from({ length: 161 }, (_, i) => row("r" + String(i).padStart(3, "0")));
    const { db } = fakeDb({ default: rows });
    const out = await selectCandidates(db, { industry: [], format: null, flags: [], celebrity: false, festive: false }, 40);
    expect(out.length).toBe(90);
  });
});
