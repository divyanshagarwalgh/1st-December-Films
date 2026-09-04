# Script Analyser for 1stdecember.com

Design, 4 September 2026.

## Summary

A public tool at `1stdecember.com/script` where a brand or agency pastes a script or a brief, enters an email, and receives an analysis grounded in First December Films' own catalogue: what the script is, how it would be produced, three comparable FDF films, two director suggestions, and an honest note on what the script is missing. FDF receives the script, the analysis and the lead attribution at the same moment.

Every submission is logged with what was recommended, and the team records what actually happened afterwards. That log is what eventually makes the recommendations evidence-based rather than merely plausible.

## Decisions taken

| Decision | Choice |
|---|---|
| Audience | Public, client facing |
| Input | Script and brief both accepted, script path is the deep one |
| Delivery | Instant, email required before the analysis runs |
| Host | Webflow Cloud, mounted at `/script` |
| Framework | Astro on the Workers edge runtime, UI hand built to match the site |
| Storage | D1 for the index and the log, KV for rate limiting |
| Retrieval | SQL pre-filter plus in-context catalogue. No embeddings, no vector store |

## Goals

1. Convert visitors who would never fill in a contact form, by giving them something useful first.
2. Capture the single most valuable inbound artefact, the script itself, along with attribution.
3. Qualify and pre-brief the lead so the first call starts further along.
4. Make the 162 Works items and 18 case studies do work instead of sitting in the CMS.
5. Start accumulating outcome data from day one.

## Non goals

- It does not learn statistically. It improves because the index gets denser and because the log eventually allows retrieval and prompts to be tuned against real outcomes.
- It does not write treatments, scripts or creative for clients.
- It does not quote. No rupee figures anywhere.
- It is not a chatbot. One input, one analysis, no conversation.

## Architecture

Three parts, built in order.

### Part A. Work Intelligence Index

A build-time process, not a runtime one. A Node script pulls every Works item from the Webflow CMS over REST, joins `directors.json` and `awards.json`, adds the case study body where one exists and the YouTube title and description, then makes one Claude extraction call per item to produce a structured record plus a short prose paragraph describing what that film is a reference for. Rows are written to D1.

This mirrors the case study pipeline in `case-studies/`, which is a proven pattern in this project. It is re-run manually after CMS changes. There is no live webhook sync, because the catalogue changes a few times a month at most.

Items with no case study still index from CMS fields alone, at lower confidence. Confidence is stored and used to prefer well-documented films when the model has a choice.

### Part B. The analyser

An Astro API route on the Workers edge runtime.

1. Validate input, check the KV rate limit, reject anything that is not a script or a brief.
2. Classify script or brief by length and shape, confirmed by the model.
3. SQL pre-filter over D1 on any attributes obvious from the input, for example industry or format. The filter is deliberately loose. If it returns fewer than forty candidates, widen it.
4. One streaming Claude call. The prompt carries the candidate records as a cached block, the analysis instructions, and the client's input. The response streams to the browser as SSE.
5. The server tees the stream into D1 and, on completion, sends FDF the notification email.

One call, not two. The catalogue block is prompt-cached, so the marginal cost per analysis is a few cents.

### Part C. The log

Every submission is written to D1 with the input, the extracted structure, which works were offered to the model, which it cited, what it recommended, and the attribution payload. A token-protected admin page lists enquiries and lets the team set a status and record what actually happened.

This is the smallest part to build and the highest value over time. It ships in version one, not later, because the data cannot be backfilled from memory.

## Data model

```sql
CREATE TABLE works (
  id                TEXT PRIMARY KEY,   -- Webflow item id
  slug              TEXT NOT NULL,
  client            TEXT,
  campaign          TEXT,
  year              TEXT,
  agency            TEXT,
  director          TEXT,
  director_slug     TEXT,
  video_url         TEXT,
  format            TEXT,               -- TVC, digital film, anthem, series, brand film
  duration_seconds  INTEGER,
  language          TEXT,
  industry          TEXT,               -- JSON array
  brief_type        TEXT,               -- launch, festive, cause, product demo, brand film
  narrative_device  TEXT,               -- twist, vignette, monologue, mockumentary, slice of life
  tone              TEXT,               -- JSON array
  celebrity         TEXT,               -- name, or null
  complexity        TEXT,               -- contained | standard | complex
  flags             TEXT,               -- JSON array: vfx, kids, animals, stunts, crowd,
                                        -- night, multi_location, water, period
  awards            TEXT,               -- JSON array of award names
  outcome           TEXT,               -- one verified sentence, or null
  reference_for     TEXT NOT NULL,      -- prose: what this film is a reference for
  has_case_study    INTEGER NOT NULL DEFAULT 0,
  confidence        TEXT NOT NULL,      -- high | medium | low
  indexed_at        TEXT NOT NULL
);

CREATE TABLE enquiries (
  id                  TEXT PRIMARY KEY,
  created_at          TEXT NOT NULL,
  email               TEXT NOT NULL,
  company             TEXT,
  input_kind          TEXT NOT NULL,    -- script | brief
  input_text          TEXT NOT NULL,
  input_hash          TEXT NOT NULL,
  extracted           TEXT,             -- JSON, the structure the model read out
  candidate_ids       TEXT,             -- JSON array offered to the model
  cited_ids           TEXT,             -- JSON array actually cited
  suggested_directors TEXT,             -- JSON array
  output_text         TEXT,
  attribution         TEXT,             -- JSON: first touch, last touch, utm, landing, visits
  status              TEXT NOT NULL DEFAULT 'new',
                                        -- new|replied|pitched|won|lost|shot|spam
  actual_director     TEXT,
  became_work_id      TEXT,
  notes               TEXT
);
```

KV holds rate limit counters keyed by email and by IP, with a rolling TTL.

## What the client sees

### Script path

1. **The read.** One paragraph, what this script actually is, in plain terms.
2. **Beat sheet.** The film's beats as the script implies them.
3. **Runtime and format.** An estimate, with the reasoning visible.
4. **Production breakdown.** Locations, cast size, day or night, and flags for VFX, kids, animals, stunts, crowd, celebrity. A complexity band, never a number.
5. **Three comparable FDF films.** Each linked, each with one specific sentence on why it is comparable: shared device, shared tone, or shared production problem.
6. **Two director suggestions.** Linked to their reels, each tied to actual credits.
7. **What we would push on.** Three to five honest notes: what is unclear, what will get expensive, where the idea is doing the least work. This section is what makes the tool read as a production house rather than a chatbot, and it should not be softened.
8. **Call to action.** Book a call, carrying the enquiry reference.

### Brief path

Sections 1, 5 and 6, plus "the questions we would ask" in place of 2, 3, 4 and 7. Deliberately lighter. A brief is where a tool most easily produces confident nonsense, and the honest move is to ask rather than to invent.

## Guardrails

**Citation is structurally constrained, not merely instructed.** The model emits work ids, never titles or URLs. The server renders every link from the D1 row. Any id outside the candidate set is dropped before render. A fabricated FDF film is therefore impossible rather than unlikely.

**No rupee figures anywhere.** Complexity band only.

**Script retention.** Stated plainly on the page: scripts are stored encrypted, seen only by FDF, never used to train anything, deleted on request. A working deletion path exists before launch, not after.

**Rate limits.** Per email and per IP, in KV.

**Refusal path.** If the input is not a script or a brief, the tool says so instead of analysing it anyway.

**Honest failure.** If the model cannot find genuinely comparable work, it says there is no close comparable rather than reaching for a weak one.

## Risks and verification

**The 20 second request timeout is the one real unknown.** Webflow Cloud documents a 20 second request timeout, a 30 second CPU limit per request, 128 MB memory, six simultaneous outgoing requests and 1,000 subrequests. The docs do not state whether the 20 seconds is total wall clock, time to first byte, or an idle timeout.

- If it is time to first byte or idle based, which is normal Workers behaviour, streaming resolves it entirely.
- If it is a hard 20 seconds of wall clock even for a streaming response, the design splits: POST starts the analysis and returns an id, the result is written to D1, the client reconnects to an SSE endpoint to read it. More parts, but a client can then close their laptop and still get the analysis.

**Verify first, before any real work.** Deploy a trivial route that streams for forty five seconds and observe what happens. One hour of work that decides the shape of Part B.

**Second check:** which site plan 1stdecember.com is on, and its Webflow Cloud request and CPU allotments. CPU per request will be small because the app spends its life waiting on the Claude API rather than computing, but this should be confirmed rather than assumed.

**Quality risk.** A generic or wrong analysis damages credibility more than having no tool. Before launch, run twenty real past briefs through it and read every output. If the "what we would push on" section is bland, the tool is not ready.

**Path ownership.** A Webflow Cloud app owns its mount path. `/script` will be built in Astro, not in the Designer. This is accepted.

## Build order

1. Verify the timeout behaviour. One throwaway deploy.
2. Part A. The index over all 162 works. Useful on its own.
3. Part B. The analyse route, guardrails, streaming.
4. The Astro front end, and the existing lead attribution hidden fields wired through.
5. Part C. The log and the admin status page.
6. Twenty real briefs run through it, read by hand, prompts tuned.
7. Launch.

Then, nearly free once the index exists: plain language search across the full catalogue on `/work`, which also addresses the Webflow 100-item render cap currently hiding roughly two thirds of the catalogue from on-site search.

## Dependencies outside this build

The Works Template binding is done. Verified on the live Nike page: the case study body, the credits block and all six FAQ pairs render server side. Nothing is blocked there. Any case studies still sitting unpublished should be published before launch, so a client can verify a comparable the tool cites.

**The real constraint is input thinness, and it shapes Part A.** Across the 156 live Works items the fill rates are: `client`, `campaign-name` and `year` at 100 percent, `meta-title` and `meta-description` at 155, `video-url-youtube` at 154, `video-duration` at 139, `agency` at 81, `full-credits` at 31, and `content-body-rich-text` plus the FAQ pairs at only 16.

So roughly 16 films have a case study to index from and roughly 140 have little more than a client name, a campaign name and a year. Indexing from CMS fields alone would produce 140 near-identical records and a tool that recommends the same three films to everyone.

**Part A must therefore pull YouTube metadata for every item with a video URL.** The description on an FDF upload is the credit sheet and usually describes the film, and the title carries the director. That is the difference between a usable index and a useless one. The pipeline for this already exists and is proven in `case-studies/`.

Note also that `project-summary` is **not** a summary. It holds a director credit on most items. It must not be indexed as description text.

## Open decisions

1. **Shoot day ranges.** Currently excluded in favour of a complexity band. A range is more useful to a client but starts to resemble a quote and reveals how FDF scopes work.
2. **Email gate placement.** Currently before the analysis runs. Collecting after the analysis renders would lift completion but lose the leads who read and leave.
