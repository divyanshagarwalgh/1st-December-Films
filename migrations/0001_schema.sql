-- Script analyser schema. Additive migrations only; never edit this file after deploy.

CREATE TABLE IF NOT EXISTS works (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL,
  client            TEXT,
  campaign          TEXT,
  year              TEXT,
  agency            TEXT,
  director          TEXT,
  director_slug     TEXT,
  video_url         TEXT,
  format            TEXT,
  duration_seconds  INTEGER,
  language          TEXT,
  industry          TEXT,
  brief_type        TEXT,
  narrative_device  TEXT,
  tone              TEXT,
  celebrity         TEXT,
  complexity        TEXT,
  flags             TEXT,
  awards            TEXT,
  outcome           TEXT,
  reference_for     TEXT NOT NULL,
  has_case_study    INTEGER NOT NULL DEFAULT 0,
  is_published      INTEGER NOT NULL DEFAULT 1,
  confidence        TEXT NOT NULL,
  indexed_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS works_confidence ON works(confidence);
CREATE INDEX IF NOT EXISTS works_format ON works(format);

CREATE TABLE IF NOT EXISTS directors (
  slug              TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  bio               TEXT,
  credits           TEXT,
  strengths         TEXT,
  indexed_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enquiries (
  id                  TEXT PRIMARY KEY,
  created_at          TEXT NOT NULL,
  email               TEXT NOT NULL,
  company             TEXT,
  input_kind          TEXT NOT NULL,
  input_text          TEXT NOT NULL,
  input_hash          TEXT NOT NULL,
  extracted           TEXT,
  candidate_ids       TEXT,
  cited_ids           TEXT,
  suggested_directors TEXT,
  output_text         TEXT,
  attribution         TEXT,
  status              TEXT NOT NULL DEFAULT 'new',
  actual_director     TEXT,
  became_work_id      TEXT,
  notes               TEXT,
  token_usage         TEXT,
  duration_ms         INTEGER,
  deleted_at          TEXT
);
CREATE INDEX IF NOT EXISTS enquiries_created ON enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS enquiries_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS enquiries_email ON enquiries(email);
