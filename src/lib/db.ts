/** Typed D1 access. Every query the app runs lives here. */
export type WorkRow = {
  id: string;
  slug: string;
  client: string | null;
  campaign: string | null;
  year: string | null;
  agency: string | null;
  director: string | null;
  director_slug: string | null;
  video_url: string | null;
  format: string | null;
  duration_seconds: number | null;
  language: string | null;
  industry: string | null;
  brief_type: string | null;
  narrative_device: string | null;
  tone: string | null;
  celebrity: string | null;
  complexity: string | null;
  flags: string | null;
  awards: string | null;
  outcome: string | null;
  reference_for: string;
  has_case_study: number;
  is_published: number;
  confidence: string;
  indexed_at: string;
};

export type DirectorRow = {
  slug: string;
  name: string;
  bio: string | null;
  credits: string | null;
  strengths: string | null;
  indexed_at: string;
};

export type EnquiryRow = {
  id: string;
  created_at: string;
  email: string;
  company: string | null;
  input_kind: string;
  input_text: string;
  input_hash: string;
  extracted: string | null;
  candidate_ids: string | null;
  cited_ids: string | null;
  suggested_directors: string | null;
  output_text: string | null;
  attribution: string | null;
  status: string;
  actual_director: string | null;
  became_work_id: string | null;
  notes: string | null;
  token_usage: string | null;
  duration_ms: number | null;
  deleted_at: string | null;
};

export const WORK_COLUMNS = [
  "id", "slug", "client", "campaign", "year", "agency", "director", "director_slug", "video_url", "format",
  "duration_seconds", "language", "industry", "brief_type", "narrative_device", "tone", "celebrity", "complexity",
  "flags", "awards", "outcome", "reference_for", "has_case_study", "is_published", "confidence", "indexed_at",
] as const;
export const DIRECTOR_COLUMNS = ["slug", "name", "bio", "credits", "strengths", "indexed_at"] as const;

export async function getAllPublishedWorks(db: D1Database): Promise<WorkRow[]> {
  const r = await db.prepare("SELECT * FROM works WHERE is_published = 1 ORDER BY id").all<WorkRow>();
  return r.results;
}

export async function getWorksByIds(db: D1Database, ids: string[]): Promise<WorkRow[]> {
  if (ids.length === 0) return [];
  const out: WorkRow[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const q = `SELECT * FROM works WHERE id IN (${chunk.map(() => "?").join(",")})`;
    const r = await db.prepare(q).bind(...chunk).all<WorkRow>();
    out.push(...r.results);
  }
  return out;
}

export async function getLiveDirectors(db: D1Database): Promise<DirectorRow[]> {
  const r = await db.prepare("SELECT * FROM directors ORDER BY name").all<DirectorRow>();
  return r.results;
}

function bindRow<T extends readonly string[]>(stmt: D1PreparedStatement, cols: T, row: Record<string, unknown>) {
  return stmt.bind(...cols.map((c) => (row[c] === undefined ? null : row[c])));
}

export async function upsertWorks(db: D1Database, rows: WorkRow[]): Promise<number> {
  const cols = WORK_COLUMNS.join(", ");
  const marks = WORK_COLUMNS.map(() => "?").join(", ");
  const stmt = db.prepare(`INSERT OR REPLACE INTO works (${cols}) VALUES (${marks})`);
  let n = 0;
  for (let i = 0; i < rows.length; i += 40) {
    const batch = rows.slice(i, i + 40).map((r) => bindRow(stmt, WORK_COLUMNS, r as unknown as Record<string, unknown>));
    await db.batch(batch);
    n += batch.length;
  }
  return n;
}

export async function upsertDirectors(db: D1Database, rows: DirectorRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = DIRECTOR_COLUMNS.join(", ");
  const marks = DIRECTOR_COLUMNS.map(() => "?").join(", ");
  const stmt = db.prepare(`INSERT OR REPLACE INTO directors (${cols}) VALUES (${marks})`);
  await db.batch(rows.map((r) => bindRow(stmt, DIRECTOR_COLUMNS, r as unknown as Record<string, unknown>)));
  return rows.length;
}

export async function indexStats(db: D1Database) {
  const works = await db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(is_published), 0) AS published, COALESCE(SUM(has_case_study), 0) AS cs FROM works")
    .first<{ n: number; published: number; cs: number }>();
  const conf = await db.prepare("SELECT confidence, COUNT(*) AS n FROM works GROUP BY confidence").all<{ confidence: string; n: number }>();
  const directors = await db.prepare("SELECT COUNT(*) AS n FROM directors").first<{ n: number }>();
  const enq = await db.prepare("SELECT COUNT(*) AS n FROM enquiries").first<{ n: number }>();
  const by: Record<string, number> = {};
  for (const r of conf.results) by[r.confidence] = r.n;
  return {
    works: works?.n ?? 0,
    published: works?.published ?? 0,
    has_case_study: works?.cs ?? 0,
    by_confidence: by,
    directors: directors?.n ?? 0,
    enquiries: enq?.n ?? 0,
  };
}

export type NewEnquiry = Pick<EnquiryRow, "id" | "created_at" | "email" | "company" | "input_kind" | "input_text" | "input_hash" | "candidate_ids" | "attribution">;

export async function insertEnquiry(db: D1Database, row: NewEnquiry) {
  await db
    .prepare(
      "INSERT INTO enquiries (id, created_at, email, company, input_kind, input_text, input_hash, candidate_ids, attribution, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')",
    )
    .bind(row.id, row.created_at, row.email, row.company, row.input_kind, row.input_text, row.input_hash, row.candidate_ids, row.attribution)
    .run();
}

export type EnquiryOutputPatch = Partial<Pick<EnquiryRow, "input_kind" | "extracted" | "cited_ids" | "suggested_directors" | "output_text" | "token_usage" | "duration_ms" | "status">>;

export async function updateEnquiryOutput(db: D1Database, id: string, patch: EnquiryOutputPatch) {
  const keys = Object.keys(patch) as (keyof EnquiryOutputPatch)[];
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${k} = ?`).join(", ");
  await db.prepare(`UPDATE enquiries SET ${sets} WHERE id = ?`).bind(...keys.map((k) => patch[k] ?? null), id).run();
}

export async function getEnquiry(db: D1Database, id: string): Promise<EnquiryRow | null> {
  return db.prepare("SELECT * FROM enquiries WHERE id = ?").bind(id).first<EnquiryRow>();
}

export async function listEnquiries(db: D1Database, status?: string, limit = 200): Promise<EnquiryRow[]> {
  const q = status
    ? db.prepare("SELECT * FROM enquiries WHERE status = ? ORDER BY created_at DESC LIMIT ?").bind(status, limit)
    : db.prepare("SELECT * FROM enquiries ORDER BY created_at DESC LIMIT ?").bind(limit);
  return (await q.all<EnquiryRow>()).results;
}

export async function updateEnquiryStatus(db: D1Database, id: string, patch: Pick<EnquiryRow, "status" | "actual_director" | "became_work_id" | "notes">) {
  await db
    .prepare("UPDATE enquiries SET status = ?, actual_director = ?, became_work_id = ?, notes = ? WHERE id = ?")
    .bind(patch.status, patch.actual_director, patch.became_work_id, patch.notes, id)
    .run();
}

export async function blankEnquiryScript(db: D1Database, id: string) {
  await db
    .prepare("UPDATE enquiries SET input_text = '', output_text = NULL, extracted = NULL, deleted_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();
}

export async function deleteEnquiry(db: D1Database, id: string) {
  await db.prepare("DELETE FROM enquiries WHERE id = ?").bind(id).run();
}
