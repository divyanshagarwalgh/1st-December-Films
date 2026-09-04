# Script Analyser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (the owner has asked for inline execution, no subagent fan-out for the extraction). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public page at `https://1stdecember.com/script` where a brand or agency pastes a script or brief, gives an email, and watches an analysis grounded in FDF's 161-film catalogue stream in, while FDF receives the script, the analysis and lead attribution, logged in D1 with an admin status page.

**Architecture:** A Webflow Cloud app (Astro 7 on the Cloudflare Workers runtime) mounted at `/script`. A Python build script indexes the Works CMS plus YouTube metadata into structured rows through one Claude extraction call per film, and ships the rows as a D1 seed migration. An Astro API route validates, rate-limits in KV, pre-filters candidates in D1 with SQL, makes one streaming Claude call with the candidate block prompt-cached, rewrites `[[work:ID]]` and `[[director:SLUG]]` markers into links from D1 rows (dropping any id outside the request's candidate set), tees the stream into D1 and emails FDF.

**Tech Stack:** Astro 7.3, `@astrojs/cloudflare` 14, wrangler 4 (local emulation only), D1, KV, `@anthropic-ai/sdk` 0.123 (TypeScript, edge) and `anthropic` (Python, index build), `claude-opus-5` for both the extraction and the analyser, vitest 5 for tests, Python 3.12 + yt-dlp + Webflow REST v2 for the index, Webflow CLI 2.7 (`webflow cloud deploy`) and GitHub push-to-deploy.

## Global Constraints

Every task's requirements implicitly include this section.

- **No em dashes (U+2014) and no en dashes (U+2013)** in anything a client reads: page copy, prompts that shape output, email templates, the retention statement, and the model's output (post-process: replace with a comma or full stop, and instruct the model). Verify with a literal scan for `chr(8212)` and `chr(8211)`. British spelling. No AI tells: no "seamlessly", "elevate", "in a world where", "it is not just X, it is Y", "delve", "testament", "Moreover", "Furthermore".
- **The model never names an FDF film.** It emits `[[work:<webflow item id>]]` only. The server renders every title and link from the D1 row and drops any id not in the request's candidate set. Directors likewise: `[[director:<slug>]]`, rendered only from the live `directors` table. A test asserts both.
- **No rupee figures, ever.** No `₹`, no `Rs`, no `INR`, no lakh or crore. Complexity band only (`contained | standard | complex`). Post-process scan drops any sentence containing those tokens and the prompt forbids them.
- **Never write to the `code` setting of a Webflow HTML Embed.** This build does not touch the Designer at all except, in Phase 5, possibly a nav link, which is Divyansh's decision and done by hand.
- **Do not modify Works CMS content.** REST reads only. No PATCH, no publish of collection items.
- **Nothing goes live without explicit confirmation**: publishing the Webflow site, creating the site-attached production environment, pointing `/script` at it, changing robots.txt or the sitemap, adding a nav link. Staging deploys on the standalone app do not need confirmation.
- Standing rule from memory: **Shivin & Sunny stay archived and unpublished**. They are never a director suggestion, never linked, and never named in client-facing output. Roopali Singhal and Suraj Wanvari are archived drafts too: same treatment. Director suggestions come only from the 9 live directors.
- `webflow_guide_tool` once before any other Webflow MCP tool. Bulk Works reads via REST, not MCP.
- Shell is PowerShell 5.1 for the owner; the agent's Bash tool is Git Bash. `PYTHONIOENCODING=utf-8` before printing non-Latin text. yt-dlp needs `--js-runtimes node`; never batch subtitle fetches; sleep between YouTube calls.
- Secrets: Webflow token at `~/.secrets/webflow-token.txt`, Anthropic key at the path Divyansh chooses (planned: `~/.secrets/anthropic-key-1st-december-films.txt`). Never print, echo, paste or commit. `.gitignore` covers `.env`, `.dev.vars`, `dev.vars`, `index/cache/`, `index/raw/`.
- Do not fan out subagents for the 161 extraction calls. If subagents are used anywhere, three or four at a time.
- Webflow Cloud limits: 20 s request timeout (semantics unknown until Phase 0), 30 s CPU, 128 MB, 6 simultaneous outgoing requests, 1,000 subrequests, D1 statement 100 KB, KV min TTL 60 s, `Cache-Control` always rewritten to `private, no-cache`.

---

## Prerequisites (owner supplies before Phase 0 deploys)

These are not invented. The plan stops at Task 3 until they exist.

| Input | Used in | Stored as |
|---|---|---|
| Anthropic API key for the deployed app | Phase 1 script, Phase 2 route | Local: `~/.secrets/anthropic-key-1st-december-films.txt` (read by path). Deployed: Webflow Cloud env var `ANTHROPIC_API_KEY`, marked Secret. Local runtime emulation: `.dev.vars` (gitignored). |
| Webflow Cloud enabled on the site plan, plus request and CPU allotment | Sizing note in `docs/` | `docs/webflow-cloud-allotment.md` |
| GitHub account and repo the app deploys from | Task 2 | `git remote origin`; Webflow Cloud GitHub App installed on that repo |
| Notification email address and sending service | Phase 4 | Env vars `NOTIFY_TO`, `EMAIL_PROVIDER`, `EMAIL_API_KEY` (Secret), `EMAIL_FROM` |

Decisions the owner still owes, asked when they bite (Phase 2): shoot-day range or complexity band only; email gate before or after the analysis renders.

---

## Environments and deployment model

- **Repo**: `D:\Claude desktop\1st December Films\script-analyser\` (a fresh git repo inside the project folder; the project folder itself is not a repo). Branch `main` deploys staging; branch `production` deploys production.
- **Staging (Phases 0 to 4)**: a standalone Webflow Cloud *project app* ("New domain") named `fdf-script-staging`, tracking `main`, mounted at `/`. It gets its own `*.webflow.io`-style domain, its own D1 and KV, and never touches the live site or requires a site publish. Everything is reachable there for the owner to review on desktop and phone.
- **Production (Phase 5)**: a site-attached app on site `6a530ef3dd045382387c1010`, environment `production`, tracking branch `production`, mount path `/script`. Creating it and publishing the site are outward-facing and need explicit confirmation. If Webflow Cloud refuses a second app on the same repo, the staging app is deleted at Phase 5 after sign-off.
- The app reads `import.meta.env.BASE_URL` at runtime for every client-side fetch and asset path, so the same build works at `/` (staging) and `/script` (production).
- Links inside analyses to `/work/<slug>` and `/director/<slug>` are absolute to `https://1stdecember.com` (env var `SITE_ORIGIN`, default `https://1stdecember.com`), so they work from staging too.

---

## File structure

```
script-analyser/
  package.json
  astro.config.mjs               # adapter + output server for local parity only
  wrangler.json                  # D1 (DB) + KV (RATE) bindings, placeholder ids
  webflow.json                   # { "cloud": { "framework": "astro" } }
  tsconfig.json
  vitest.config.ts
  .gitignore
  .dev.vars.example              # names only, no values
  CLAUDE.md                      # written by /init after Task 2
  migrations/
    0001_schema.sql              # works, directors, enquiries + indexes
    0002_seed_works.sql          # GENERATED by index/build_index.py (Phase 1)
  index/                         # Phase 1, Python
    fetch_cms.py                 # Works + reference collections over REST -> raw/
    fetch_youtube.py             # yt-dlp -J per item, cached, throttled -> raw/yt/
    extract.py                   # one Claude call per item -> out/<id>.json
    emit_seed.py                 # out/*.json -> migrations/0002_seed_works.sql + data/works-index.json
    review_sample.py             # ten random rows beside their sources for the owner
    prompts/extract_system.txt
    raw/  out/  (gitignored)     # cache; resumable
  data/
    works-index.json             # committed snapshot of the index (161 rows)
    directors.json               # committed snapshot of the 9 live directors
  src/
    env.d.ts
    lib/
      db.ts                      # typed D1 queries (works, directors, enquiries)
      refs.ts                    # marker rewriter + guardrail (pure, tested)
      prefilter.ts               # SQL pre-filter, widening to >= 40
      classify.ts                # script vs brief heuristic (pure, tested)
      prompt.ts                  # system prompt + candidate block builder
      analyse.ts                 # the streaming Claude call, SSE writer, tee to D1
      ratelimit.ts               # KV counters
      sanitize.ts                # dash + rupee post-processing (pure, tested)
      email.ts                   # provider-agnostic sendEmail
      attribution.ts             # server-side validation of the attribution payload
      auth.ts                    # admin token check, constant time
    pages/
      index.astro                # the /script page (Phase 3)
      r/[id].astro               # read-only result page, noindex
      admin/index.astro          # enquiry list (Phase 4)
      admin/[id].astro           # enquiry detail + status form
      api/analyse.ts             # POST, SSE (Phase 2)
      api/probe/*.ts             # Phase 0 only, deleted afterwards
      api/admin/reindex.ts       # POST, token, upserts works rows (Phase 1)
      api/admin/stats.ts         # GET, token, row count + confidence distribution
      api/admin/enquiry.ts       # POST, token, status update / delete script text
      api/health.ts              # GET, bindings check
    components/                  # Phase 3
    styles/site.css              # matched to 1stdecember.com
  tests/
    refs.test.ts                 # THE guardrail test
    classify.test.ts
    sanitize.test.ts
    prefilter.test.ts
    analyse-parse.test.ts        # header/section/extracted-block parsing
  scripts/
    run-briefs.ts                # Phase 2 acceptance: 20 briefs -> out/briefs/*.md
    briefs/*.txt                 # the 20 inputs
  docs/
    2026-09-05-timeout-finding.md
    webflow-cloud-allotment.md
```

---

# Phase 0. Verify the timeout (blocking)

### Task 1: Scaffold the Astro project with bindings and a health route

**Files:**
- Create: `script-analyser/package.json`, `astro.config.mjs`, `wrangler.json`, `webflow.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.dev.vars.example`, `src/env.d.ts`, `src/pages/index.astro`, `src/pages/api/health.ts`, `migrations/0001_schema.sql`

**Interfaces:**
- Produces: `App.Locals.runtime.env` typed with `DB: D1Database`, `RATE: KVNamespace`, and the string env vars listed below. Every later task reads bindings this way.

- [ ] **Step 1: Create the project**

```bash
cd "D:/Claude desktop/1st December Films"
npm create astro@latest script-analyser -- --template minimal --no-install --no-git --typescript strict --yes
cd script-analyser
npm install
npm install @astrojs/cloudflare @anthropic-ai/sdk
npm install --save-dev wrangler @cloudflare/workers-types vitest typescript
```

- [ ] **Step 2: Write `astro.config.mjs`** (adapter for local parity only; Webflow Cloud overrides base and output at build time, so `base` is never set)

```js
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare({ platformProxy: { enabled: true } }),
  devToolbar: { enabled: false },
});
```

- [ ] **Step 3: Write `wrangler.json`**

```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "fdf-script",
  "main": "dist/_worker.js/index.js",
  "compatibility_date": "2025-04-15",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    { "binding": "DB", "database_name": "fdf_script", "database_id": "local", "migrations_dir": "migrations" }
  ],
  "kv_namespaces": [
    { "binding": "RATE", "id": "local" }
  ]
}
```

- [ ] **Step 4: Write `webflow.json`, `.gitignore`, `.dev.vars.example`, `src/env.d.ts`**

`webflow.json`:
```json
{ "cloud": { "framework": "astro" } }
```

`.gitignore`:
```
node_modules/
dist/
.astro/
.wrangler/
.env
.env.*
.dev.vars
dev.vars
index/raw/
index/out/
scripts/out/
*.log
```

`.dev.vars.example` (names only):
```
ANTHROPIC_API_KEY=
ADMIN_TOKEN=
NOTIFY_TO=
EMAIL_PROVIDER=
EMAIL_API_KEY=
EMAIL_FROM=
SITE_ORIGIN=https://1stdecember.com
```

`src/env.d.ts`:
```ts
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type Runtime = import("@astrojs/cloudflare").Runtime<{
  DB: D1Database;
  RATE: KVNamespace;
  ANTHROPIC_API_KEY: string;
  ADMIN_TOKEN: string;
  NOTIFY_TO: string;
  EMAIL_PROVIDER: string;
  EMAIL_API_KEY: string;
  EMAIL_FROM: string;
  SITE_ORIGIN?: string;
}>;

declare namespace App {
  interface Locals extends Runtime {}
}
```

- [ ] **Step 5: Write `migrations/0001_schema.sql`** (spec data model plus a `directors` table and three small columns: `token_usage`, `duration_ms`, `deleted_at`)

```sql
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
  credits           TEXT,               -- JSON array of {work_id, client, campaign, year}
  strengths         TEXT,               -- prose, derived at index time from their films
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
```

- [ ] **Step 6: Write `src/pages/api/health.ts`**

```ts
export const config = { runtime: "edge" };
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  let d1 = "missing", kv = "missing";
  try { await env.DB.prepare("SELECT 1").first(); d1 = "ok"; } catch (e) { d1 = "error: " + (e as Error).message; }
  try { await env.RATE.get("health"); kv = "ok"; } catch (e) { kv = "error: " + (e as Error).message; }
  return new Response(JSON.stringify({ d1, kv, base: import.meta.env.BASE_URL, hasKey: !!env.ANTHROPIC_API_KEY }), {
    headers: { "content-type": "application/json" },
  });
};
```

- [ ] **Step 7: Write a placeholder `src/pages/index.astro`** (one heading, replaced in Phase 3) and `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
```

- [ ] **Step 8: Add scripts to `package.json`**

```json
"scripts": {
  "dev": "astro dev",
  "build": "astro build",
  "preview": "astro build && wrangler dev",
  "test": "vitest run",
  "db:local": "wrangler d1 migrations apply DB --local",
  "cf:types": "wrangler types"
}
```

- [ ] **Step 9: Run locally and hit health**

```bash
npm run db:local
npm run preview
```
Then `curl http://localhost:8787/api/health`. Expected: `{"d1":"ok","kv":"ok","base":"/","hasKey":false}`.

- [ ] **Step 10: Commit**

```bash
git init -b main
git add -A
git commit -m "chore: scaffold Astro app with D1 and KV bindings"
```

### Task 2: Repo on GitHub, Webflow CLI, standalone staging app

**Files:** none new; `webflow.json` gains `cloud.app_id` after first deploy.

- [ ] **Step 1: Add the GitHub remote the owner supplied and push**

```bash
git remote add origin <REPO_URL_FROM_OWNER>
git push -u origin main
```

- [ ] **Step 2: Install the Webflow CLI and log in** (opens a browser; the owner authorises)

```bash
npm install -g @webflow/webflow-cli
webflow auth login
```

- [ ] **Step 3: Create the standalone staging app from the repo** (no site attached, no site publish)

Preferred, via the Webflow dashboard deploy wizard at https://webflow.com/dashboard/cloud/deploy: Import a GitHub repository, pick the repo, branch `main`, app name `fdf-script-staging`, target **New domain**. The owner clicks Deploy. Alternative from the CLI:

```bash
webflow cloud deploy --new --app-name fdf-script-staging --mount / --environment staging
```

- [ ] **Step 4: Record the app id and staging URL** in `webflow.json` (`cloud.app_id`) and in `docs/environments.md`. Verify `https://<staging-host>/api/health` returns `d1: ok, kv: ok`.

- [ ] **Step 5: Run `/init`** to give the repo a `CLAUDE.md`, then commit.

### Task 3: Timeout probe routes

**Files:**
- Create: `src/pages/api/probe/stream.ts`, `src/pages/api/probe/ttfb.ts`, `src/pages/api/probe/idle.ts`, `src/pages/probe.astro`

**Interfaces:**
- Produces: `docs/2026-09-05-timeout-finding.md` stating which of {wall clock, time to first byte, idle} the 20 seconds is, and the branch Phase 2 takes.

- [ ] **Step 1: Write the three probes**

`src/pages/api/probe/stream.ts` (headers immediately, one SSE event per second for 45 s):
```ts
export const config = { runtime: "edge" };
import type { APIRoute } from "astro";

function sse(total: number, firstDelayMs: number, gapAtSec: number | null, gapMs: number) {
  const enc = new TextEncoder();
  const started = Date.now();
  return new ReadableStream({
    async start(ctrl) {
      const send = (s: string) => ctrl.enqueue(enc.encode(s));
      if (firstDelayMs > 0) await new Promise(r => setTimeout(r, firstDelayMs));
      for (let i = 1; i <= total; i++) {
        if (gapAtSec !== null && i === gapAtSec) await new Promise(r => setTimeout(r, gapMs));
        send(`event: tick\ndata: {"i":${i},"t":${Date.now() - started}}\n\n`);
        await new Promise(r => setTimeout(r, 1000));
      }
      send(`event: done\ndata: {"t":${Date.now() - started}}\n\n`);
      ctrl.close();
    },
  });
}
const headers = { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no" };
export const GET: APIRoute = () => new Response(sse(45, 0, null, 0), { headers });
export { sse, headers };
```
`ttfb.ts`: `new Response(sse(20, 25000, null, 0), { headers })` (first byte after 25 s).
`idle.ts`: `new Response(sse(40, 0, 10, 25000), { headers })` (ticks 1 to 9, then a 25 s silence, then ticks 10 to 40).

- [ ] **Step 2: Write `src/pages/probe.astro`**: three buttons, each opens an `EventSource` on `${import.meta.env.BASE_URL}/api/probe/<name>` and appends `tick` events with wall-clock timestamps and any `error` event to a `<pre>`.

- [ ] **Step 3: Push, wait for the staging deploy, observe**

Observe each probe from the browser page and from curl (`curl -N https://<staging-host>/api/probe/stream`), noting the second at which the connection drops, if it drops. Also confirm chunks arrive in real time and are not buffered.

- [ ] **Step 4: Write the finding** to `docs/2026-09-05-timeout-finding.md`: table of probe, expected, observed, plus one sentence "The 20 seconds is X" and the Phase 2 branch:
  - TTFB or idle: Phase 2 streams directly, and the server sends a `meta` SSE event within milliseconds and a `: ping` comment every 5 s while the model thinks.
  - Hard wall clock: Phase 2 becomes start-and-reconnect. `POST /api/analyse` validates, writes an `enquiries` row with `status='running'`, starts the Claude call under `waitUntil` writing partial output into `output_text` every 2 s, and returns `{id}` in under a second. `GET /api/result/[id]` returns the row (the client polls every 1.5 s, or opens an SSE that replays the stored text and closes after 15 s for the client to reopen). The `[[work:]]` rewriter runs on the stored text at read time with the row's `candidate_ids`.

- [ ] **Step 5: Report to the owner, wait for "continue"**. Delete the probe routes and page in the first Phase 1 commit.

---

# Phase 1. The Work Intelligence Index

### Task 4: Fetch the CMS over REST into `index/raw/`

**Files:**
- Create: `index/fetch_cms.py`, `index/common.py`

**Interfaces:**
- Produces: `index/raw/works.json` (list of 161 items, raw API shape), `index/raw/directors.json`, `awards.json`, `industries.json`, `services.json`, `brands.json`, each `{id: item}`.

- [ ] **Step 1: `index/common.py`**

```python
import os, json, time, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "raw"); OUT = os.path.join(ROOT, "out")
os.makedirs(RAW, exist_ok=True); os.makedirs(OUT, exist_ok=True)
WORKS = "6a539a341dd7916d7208e658"
REFS = {"directors": "6a53a8a08a3b83a3ed93fd84", "awards": "6a53a734d2f5baa54274ddb7",
        "industries": "6a539afd6c828a117d0d2943", "services": "6a539cadd00e55970ea7e92a",
        "brands": "6a54ea2aa030395b4925092c"}
def wf_token():
    return open(os.path.expanduser("~/.secrets/webflow-token.txt"), encoding="utf-8").read().strip()
def wf_get(path, params=None):
    url = "https://api.webflow.com/v2" + path
    if params: url += "?" + "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + wf_token(), "accept": "application/json"})
    for attempt in range(5):
        try:
            return json.load(urllib.request.urlopen(req, timeout=60))
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(2 ** attempt); continue
            raise
def wf_all_items(cid):
    items, offset = [], 0
    while True:
        page = wf_get(f"/collections/{cid}/items", {"limit": 100, "offset": offset})
        items += page["items"]; offset += 100
        if offset >= page["pagination"]["total"]: return items
def load(name): return json.load(open(os.path.join(RAW, name + ".json"), encoding="utf-8"))
def save(name, obj, folder=RAW):
    json.dump(obj, open(os.path.join(folder, name + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
```

- [ ] **Step 2: `index/fetch_cms.py`**

```python
from common import *
works = wf_all_items(WORKS); save("works", works); print("works", len(works))
for name, cid in REFS.items():
    items = wf_all_items(cid); save(name, {i["id"]: i for i in items}); print(name, len(items))
```

- [ ] **Step 3: Run and verify counts**: `python index/fetch_cms.py` prints `works 161`, `directors 12`, `awards 69`, `industries 18`, `services 12`, `brands 61`.

- [ ] **Step 4: Print the fill-rate table** (a 15-line inline Python check over `works.json`: for each field, count non-empty across `isDraft == False and isArchived == False`) and confirm it matches the spec's numbers (client/campaign-name/year 100 percent, video-url-youtube 154, content-body-rich-text 16). Commit `index/` (raw is gitignored).

### Task 5: YouTube metadata for every item with a video URL

**Files:**
- Create: `index/fetch_youtube.py`

**Interfaces:**
- Produces: `index/raw/yt/<video_id>.json` with `title, description, duration, upload_date, channel, view_count, language` from yt-dlp `-J`, and `index/raw/yt_index.json` mapping work id to video id or `null` with a reason.

- [ ] **Step 1: Write the script** (resumable; ~161 calls; sleep 4 to 7 s randomised; no subtitles)

```python
import re, random, subprocess, sys, time
from common import *
works = load("works")
def vid(url):
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{11})", url or "")
    return m.group(1) if m else None
os.makedirs(os.path.join(RAW, "yt"), exist_ok=True)
index = {}
for w in works:
    fd = w["fieldData"]; url = fd.get("video-url-youtube") or (fd.get("video-embed-url") or {}).get("url")
    v = vid(url)
    if not v: index[w["id"]] = {"video_id": None, "reason": "no youtube url"}; continue
    path = os.path.join(RAW, "yt", v + ".json")
    if not os.path.exists(path):
        r = subprocess.run([sys.executable, "-m", "yt_dlp", "-J", "--js-runtimes", "node", "--no-warnings",
                            "https://www.youtube.com/watch?v=" + v], capture_output=True, text=True, encoding="utf-8")
        if r.returncode != 0:
            index[w["id"]] = {"video_id": v, "reason": "yt-dlp failed: " + r.stderr.strip()[-200:]}
            time.sleep(random.uniform(4, 7)); continue
        j = json.loads(r.stdout)
        keep = {k: j.get(k) for k in ["id", "title", "description", "duration", "upload_date", "channel", "uploader", "view_count", "language", "tags", "categories"]}
        json.dump(keep, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        time.sleep(random.uniform(4, 7))
    index[w["id"]] = {"video_id": v, "reason": None}
save("yt_index", index)
ok = sum(1 for x in index.values() if x["reason"] is None)
print("fetched", ok, "of", len(index), "| failures:", [k for k, x in index.values() if x["reason"]][:20] if False else sum(1 for x in index.values() if x["reason"]))
```

- [ ] **Step 2: Run in the background** (`PYTHONIOENCODING=utf-8 python index/fetch_youtube.py`), expected 10 to 20 minutes. Re-run for failures once; record persistent failures (private or removed videos, e.g. Vivo X300 Pro `XCDa8AVHW9M` is known to be unavailable) in `docs/index-notes.md`.

- [ ] **Step 3: Verify**: at least 145 of 154 URLs fetched; every FDF-channel title parsed into `Brand | Director | EP | First December Films` parts by a small regex check printed as a table of the first 20.

### Task 6: One Claude extraction call per item

**Files:**
- Create: `index/extract.py`, `index/prompts/extract_system.txt`

**Interfaces:**
- Consumes: `raw/works.json`, `raw/yt/*.json`, `raw/directors.json`, etc.
- Produces: `index/out/<work_id>.json` with the schema below, one per item, plus `index/out/_directors.json`.

Record schema (the model's output, validated with Pydantic):
```python
class Extract(BaseModel):
    format: Literal["TVC","digital film","anthem","series","brand film","case study film","short","other"]
    language: str | None
    industry: list[str]
    brief_type: Literal["launch","festive","cause","product demo","brand film","performance","recruitment","other"] | None
    narrative_device: str | None      # twist, vignette, monologue, mockumentary, slice of life, montage, testimonial, other
    tone: list[str]
    celebrity: str | None             # only if named in the sources
    complexity: Literal["contained","standard","complex"]
    flags: list[Literal["vfx","kids","animals","stunts","crowd","night","multi_location","water","period","music_led","sport","food","vehicle","animation"]]
    outcome: str | None               # ONE sentence, only if a source states it verbatim; else null
    reference_for: str                # 60 to 120 words, plain prose, no dashes
    confidence: Literal["high","medium","low"]
    confidence_reason: str
```

- [ ] **Step 1: Write `index/prompts/extract_system.txt`**

```
You index films made by First December Films, a Mumbai ad film production house, so a later tool can find comparable work for a client's script. You receive one film's sources: the CMS record, the credit sheet from the YouTube description, the YouTube title, and sometimes a case study. Produce one JSON record.

Rules.
Use only what the sources say. Never guess awards, view counts, credits, results or celebrity names. If a field is not supported by the sources, set it to null or an empty list.
reference_for is the paragraph a producer would write to explain what this film is a useful reference for: the brief type, the device the script uses, the production shape (locations, cast, day or night, anything expensive), and the tone. Concrete over abstract. 60 to 120 words. British spelling. No em dashes, no en dashes, no bullet points, no rupee figures, no film title inside the paragraph.
complexity: contained means one or two locations, small cast, no specialist departments. complex means any of large crowd, heavy VFX, stunts, animals, water, period, celebrity, many locations, or a series. standard is the rest.
confidence: high when a case study or a full credit sheet plus a described film exists; medium when the YouTube description describes the film; low when only CMS fields were available.
The film's client and campaign are given; do not restate them as facts you inferred.
```

- [ ] **Step 2: Write `index/extract.py`** (Python SDK; upgrade first with `pip install -U anthropic`; `claude-opus-5`; structured output via `client.messages.parse` with the Pydantic model; resumable; caches the system prompt block)

```python
import hashlib, sys, time
from typing import Literal
from pydantic import BaseModel
import anthropic
from common import *

SYSTEM = open(os.path.join(ROOT, "prompts", "extract_system.txt"), encoding="utf-8").read()
client = anthropic.Anthropic(api_key=open(os.path.expanduser("~/.secrets/anthropic-key-1st-december-films.txt"), encoding="utf-8").read().strip())
works = load("works"); yt = load("yt_index"); dirs = load("directors"); awards = load("awards")
inds = load("industries"); svcs = load("services"); brands = load("brands")

def names(ids, table): return [table[i]["fieldData"]["name"] for i in (ids or []) if i in table]
def strip_html(s): return re.sub(r"<[^>]+>", " ", s or "").replace("&nbsp;", " ")

def sources_for(w):
    fd = w["fieldData"]; yv = yt.get(w["id"], {}).get("video_id")
    y = json.load(open(os.path.join(RAW, "yt", yv + ".json"), encoding="utf-8")) if yv and os.path.exists(os.path.join(RAW, "yt", yv + ".json")) else None
    parts = [f"CLIENT: {fd.get('client')}", f"CAMPAIGN: {fd.get('campaign-name')}", f"YEAR: {fd.get('year')}", f"AGENCY: {fd.get('agency')}",
             f"DIRECTORS (CMS): {', '.join(names(fd.get('directors'), dirs))}",
             f"INDUSTRIES (CMS): {', '.join(names(fd.get('industries'), inds))}",
             f"SERVICES (CMS): {', '.join(names(fd.get('services'), svcs))}",
             f"AWARDS (CMS): {', '.join(names(fd.get('awards'), awards))}",
             f"DURATION (CMS): {fd.get('video-duration')}", f"META TITLE: {fd.get('meta-title')}", f"META DESCRIPTION: {fd.get('meta-description')}",
             f"IMPACT (CMS, may be unverified marketing copy): {strip_html(fd.get('impact'))}",
             f"PROJECT DETAILS (CMS): {strip_html(fd.get('project-details'))}",
             f"FULL CREDITS (CMS): {strip_html(fd.get('full-credits'))}"]
    if y: parts += [f"YOUTUBE TITLE: {y.get('title')}", f"YOUTUBE DURATION SECONDS: {y.get('duration')}", f"YOUTUBE UPLOAD DATE: {y.get('upload_date')}",
                    f"YOUTUBE CHANNEL: {y.get('channel')}", f"YOUTUBE DESCRIPTION:\n{y.get('description')}"]
    body = strip_html(fd.get("content-body-rich-text"))
    if body.strip(): parts.append(f"CASE STUDY:\n{body[:12000]}")
    return "\n".join(parts), bool(body.strip()), y

class Extract(BaseModel):  # as in the interface block above

for w in works:
    out = os.path.join(OUT, w["id"] + ".json")
    if os.path.exists(out): continue
    src, has_cs, y = sources_for(w)
    msg = client.messages.parse(model="claude-opus-5", max_tokens=4000,
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": src}], output_format=Extract)
    rec = msg.parsed_output.model_dump()
    rec.update({"id": w["id"], "slug": w["fieldData"]["slug"], "has_case_study": has_cs, "source_hash": hashlib.sha1(src.encode()).hexdigest(),
                "yt_title": y and y.get("title"), "yt_duration": y and y.get("duration"), "usage": msg.usage.model_dump()})
    json.dump(rec, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(w["fieldData"]["slug"], rec["confidence"], flush=True); time.sleep(0.5)
```
(If the installed SDK's structured-output parameter differs, check `python -c "import anthropic,inspect;print(inspect.signature(anthropic.Anthropic().messages.parse))"` and use `output_config={"format": ...}` accordingly; the skill's Python README is authoritative.)

- [ ] **Step 3: Dry-run on 3 items**, read the three records against their sources by eye, adjust the prompt if anything is invented, then run all 161 in the background. Expected cost under $10.

- [ ] **Step 4: Directors**: `index/out/_directors.json` built deterministically (no model call): for each of the 9 live directors, `slug, name, bio` from the CMS and `credits` = every work whose CMS `directors` contains them **or** whose FDF YouTube title names them, sorted by year desc. `strengths`: one Claude call per director summarising their `reference_for` paragraphs into 60 words (9 calls). Archived directors are excluded entirely.

- [ ] **Step 5: Director on each work row**: `director` = the name from the FDF YouTube title when the title matches `Brand | Director | ...` and that director is one of the 12 CMS directors, else the CMS reference. `director_slug` set only when that director is live (9); for the 18 Shivin & Sunny films and any Roopali/Suraj films, `director` keeps the name for internal retrieval but `director_slug` is null, and the client-facing render never shows a director for a work row.

### Task 7: Emit the seed migration and the committed snapshot; upload; verify in D1

**Files:**
- Create: `index/emit_seed.py`, `migrations/0002_seed_works.sql` (generated), `data/works-index.json`, `data/directors.json`, `src/pages/api/admin/reindex.ts`, `src/pages/api/admin/stats.ts`, `src/lib/auth.ts`, `src/lib/db.ts`, `index/review_sample.py`

**Interfaces:**
- Produces: `WorkRow` and `DirectorRow` types in `src/lib/db.ts`; `getWorksByIds(db, ids)`, `getAllPublishedWorks(db)`, `getLiveDirectors(db)`, `insertEnquiry`, `updateEnquiryOutput`, `getEnquiry`, `listEnquiries`, `updateEnquiryStatus`, `blankEnquiryScript`.

- [ ] **Step 1: `index/emit_seed.py`**: loads every `out/*.json`, dash-scans `reference_for` and `outcome` (fail loudly on U+2013/U+2014), scans for rupee tokens, then writes `data/works-index.json` and `migrations/0002_seed_works.sql` as `INSERT OR REPLACE INTO works (...) VALUES (...)` rows (SQL-escaped with doubled single quotes, JSON columns as JSON strings, one statement per row to stay under the 100 KB statement limit), plus the directors rows. `is_published` = not draft and not archived.

- [ ] **Step 2: `src/lib/auth.ts`**

```ts
export function checkAdmin(request: Request, token: string): boolean {
  const h = request.headers.get("authorization") || "";
  const url = new URL(request.url);
  const supplied = h.startsWith("Bearer ") ? h.slice(7) : (url.searchParams.get("token") || "");
  if (!token || supplied.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= supplied.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 3: `src/pages/api/admin/reindex.ts`**: POST, `checkAdmin`, body `{works: WorkRow[], directors: DirectorRow[]}`, upserts in batches of 50 with `db.batch([...])`, returns counts. `src/pages/api/admin/stats.ts`: GET, `checkAdmin`, returns `{works: n, published: n, by_confidence: {high, medium, low}, has_case_study: n, directors: n, enquiries: n}`.

- [ ] **Step 4: Local check**: `npm run db:local` applies 0001 and 0002; `curl localhost:8787/api/admin/stats?token=...` shows 161 rows.

- [ ] **Step 5: Push; staging deploy applies the migration; `curl https://<staging>/api/admin/stats?token=...` shows 161.** Set `ADMIN_TOKEN` in the staging environment variables first (a 32-byte random hex, generated locally, stored at `~/.secrets/fdf-admin-token.txt`).

- [ ] **Step 6: `index/review_sample.py`**: picks 10 random work ids (seeded from the date), prints for each: the D1-bound record beside the YouTube title, the first 400 chars of the YouTube description, the CMS client/campaign/year, and the case-study first paragraph if any, into `docs/index-review-<date>.md`. Send it to the owner with the confidence distribution. **Wait for "continue".**

---

# Phase 2. The analyser route

### Task 8: The citation guardrail (TDD, first)

**Files:**
- Create: `src/lib/refs.ts`, `tests/refs.test.ts`

**Interfaces:**
- Produces:
```ts
export type WorkRef = { id: string; slug: string; client: string | null; campaign: string | null; year: string | null };
export type DirectorRef = { slug: string; name: string };
export function renderWorkRef(w: WorkRef, origin: string): string;      // <a href="{origin}/work/{slug}">{client}, {campaign} ({year})</a>
export function renderDirectorRef(d: DirectorRef, origin: string): string;
export function createRefRewriter(opts: { works: Map<string, WorkRef>; directors: Map<string, DirectorRef>; origin: string }): {
  push(chunk: string): string;   // returns renderable text; holds back any partial "[[" tail
  flush(): string;
  cited: string[]; droppedWorks: string[]; suggestedDirectors: string[]; droppedDirectors: string[];
};
```

- [ ] **Step 1: Write the failing tests** (`tests/refs.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { createRefRewriter } from "../src/lib/refs";
const origin = "https://1stdecember.com";
const works = new Map([["A1", { id: "A1", slug: "nike-make-every-yard-count", client: "Nike", campaign: "Make Every Yard Count", year: "2023" }]]);
const directors = new Map([["atul-kattukaran", { slug: "atul-kattukaran", name: "Atul Kattukaran" }]]);

describe("citation guardrail", () => {
  it("renders an id in the candidate set from the D1 row, never from the model", () => {
    const r = createRefRewriter({ works, directors, origin });
    const out = r.push("Closest is [[work:A1]] because of the single take.") + r.flush();
    expect(out).toContain('<a href="https://1stdecember.com/work/nike-make-every-yard-count">Nike, Make Every Yard Count (2023)</a>');
    expect(r.cited).toEqual(["A1"]);
  });
  it("drops an id that is not in the candidate set, leaving no link and no title", () => {
    const r = createRefRewriter({ works, directors, origin });
    const out = r.push("See [[work:ZZ9]] for a crowd film.") + r.flush();
    expect(out).not.toContain("ZZ9"); expect(out).not.toContain("<a"); expect(r.droppedWorks).toEqual(["ZZ9"]);
    expect(out).toBe("See  for a crowd film.".replace("  ", " "));
  });
  it("drops a real catalogue id that was not offered in this request", () => {
    const r = createRefRewriter({ works: new Map(), directors, origin });
    expect(r.push("[[work:A1]]") + r.flush()).not.toContain("Nike");
  });
  it("renders a marker split across chunks", () => {
    const r = createRefRewriter({ works, directors, origin });
    const out = r.push("Try [[wo") + r.push("rk:A1]] here") + r.flush();
    expect(out).toContain("Nike, Make Every Yard Count");
  });
  it("holds back a partial tail and releases it on flush", () => {
    const r = createRefRewriter({ works, directors, origin });
    expect(r.push("text [[")).toBe("text "); expect(r.flush()).toBe("[[");
  });
  it("drops a director slug that is not live", () => {
    const r = createRefRewriter({ works, directors, origin });
    const out = r.push("[[director:shivin-and-sunny]] and [[director:atul-kattukaran]]") + r.flush();
    expect(out).not.toContain("shivin"); expect(out).toContain('/director/atul-kattukaran">Atul Kattukaran</a>');
    expect(r.droppedDirectors).toEqual(["shivin-and-sunny"]); expect(r.suggestedDirectors).toEqual(["atul-kattukaran"]);
  });
  it("escapes HTML in row values", () => {
    const w = new Map([["B", { id: "B", slug: "x", client: "A&B <Co>", campaign: "Q", year: "2020" }]]);
    const r = createRefRewriter({ works: w, directors, origin });
    expect(r.push("[[work:B]]") + r.flush()).toContain("A&amp;B &lt;Co&gt;");
  });
});
```

- [ ] **Step 2: Run, expect failure**: `npx vitest run tests/refs.test.ts` fails with "Cannot find module".

- [ ] **Step 3: Implement `src/lib/refs.ts`**

```ts
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export function renderWorkRef(w: WorkRef, origin: string) {
  const label = [w.client, w.campaign].filter(Boolean).join(", ") + (w.year ? ` (${esc(String(w.year).slice(0, 4))})` : "");
  return `<a href="${origin}/work/${esc(w.slug)}">${esc(label)}</a>`;
}
export function renderDirectorRef(d: DirectorRef, origin: string) {
  return `<a href="${origin}/director/${esc(d.slug)}">${esc(d.name)}</a>`;
}
const MARK = /\[\[(work|director):([A-Za-z0-9_-]+)\]\]/g;
export function createRefRewriter({ works, directors, origin }) {
  let buf = ""; const state = { cited: [] as string[], droppedWorks: [] as string[], suggestedDirectors: [] as string[], droppedDirectors: [] as string[] };
  const uniq = (a: string[], v: string) => { if (!a.includes(v)) a.push(v); };
  function render(s: string) {
    return s.replace(MARK, (_, kind, key) => {
      if (kind === "work") { const w = works.get(key); if (!w) { uniq(state.droppedWorks, key); return ""; } uniq(state.cited, key); return renderWorkRef(w, origin); }
      const d = directors.get(key); if (!d) { uniq(state.droppedDirectors, key); return ""; } uniq(state.suggestedDirectors, key); return renderDirectorRef(d, origin);
    });
  }
  return {
    push(chunk: string) {
      buf += chunk;
      const open = buf.lastIndexOf("[["), close = buf.lastIndexOf("]]");
      let cut = buf.length;
      if (open > close) cut = open;                       // an unterminated marker: hold it back
      else if (buf.endsWith("[")) cut = buf.length - 1;   // a lone "[" that may become "[["
      const out = render(buf.slice(0, cut)); buf = buf.slice(cut); return out;
    },
    flush() { const out = render(buf); buf = ""; return out; },
    get cited() { return state.cited; }, get droppedWorks() { return state.droppedWorks; },
    get suggestedDirectors() { return state.suggestedDirectors; }, get droppedDirectors() { return state.droppedDirectors; },
  };
}
```
Note: `flush()` still renders known markers; an unterminated `[[` at the end is emitted literally, which the sanitiser strips (Task 10).

- [ ] **Step 4: Run, expect pass. Commit** `feat: citation guardrail rewriter with tests`.

### Task 9: Classifier, pre-filter, sanitiser (pure, tested)

**Files:**
- Create: `src/lib/classify.ts`, `src/lib/prefilter.ts`, `src/lib/sanitize.ts`, `tests/classify.test.ts`, `tests/prefilter.test.ts`, `tests/sanitize.test.ts`

**Interfaces:**
```ts
export function classifyInput(text: string): { kind: "script" | "brief" | "unknown"; reasons: string[] };
export function extractHints(text: string): { industry: string[]; format: string | null; flags: string[]; celebrity: boolean; festive: boolean };
export function buildCandidateQuery(hints, minimum = 40): { sql: string; params: unknown[] }[];   // ordered widening steps
export async function selectCandidates(db: D1Database, hints, minimum = 40): Promise<WorkRow[]>;
export function sanitizeOutput(text: string): string;   // dashes -> ", " or ". "; drops sentences with rupee tokens; strips stray "[[" / "]]"
```

- [ ] **Step 1: Tests first.** `classify`: a 900-word text with `VO:`, `CUT TO:`, `SFX`, `Scene 1`, `INT.` lines is `script`; a 150-word paragraph mentioning "target audience", "objective", "deliverables", "TG" is `brief`; a recipe or a job ad is `unknown`; an input under 40 words is `unknown`. `prefilter`: given hints `{industry: ["automotive"], flags: ["vehicle"]}` the first query filters on `industry LIKE '%automotive%'`; the widening sequence ends with `SELECT ... WHERE is_published = 1 ORDER BY confidence DESC, has_case_study DESC, year DESC LIMIT 161`. `sanitize`: `"one EM two EN three"` (with a real U+2014 and U+2013 in the test file) becomes `"one, two, three"`; a sentence containing `₹5 lakh`, `Rs 20,000`, `INR 3`, `2 crore` is removed entirely; `"tail [["` becomes `"tail"`.

- [ ] **Step 2: Implement.** Classifier weights: script markers (`^(INT|EXT)\.`, `VO:`, `V\.O\.`, `SFX`, `CUT TO`, `SUPER:`, `MVO`, `FVO`, `Scene \d`, `OPEN ON`, `CLOSE ON`, `Frame \d`, dialogue lines `^[A-Z][A-Za-z ]{1,25}:\s`) vs brief markers (`objective`, `target audience`, `TG`, `deliverables`, `budget`, `key message`, `proposition`, `tone of voice`, `KPI`, `duration`, `edits`, `platforms`). Score both; `script` if scriptScore >= 3 and > briefScore, `brief` if briefScore >= 2 or (length < 350 words and scriptScore < 2), else `unknown` when neither reaches its threshold. Pre-filter widening order: (1) industry match AND format match; (2) industry match; (3) any flag overlap OR same brief_type; (4) all published, best documented first. Stop at the first step yielding >= 40, always union with step 4's top 12 by confidence so well-documented films are always present. Deduplicate, cap at 90, sort by `id` for a byte-stable candidate block (cache-friendly).

- [ ] **Step 3: Run tests, commit** `feat: classifier, prefilter and sanitiser`.

### Task 10: Prompt, streaming call, SSE route, tee to D1

**Files:**
- Create: `src/lib/prompt.ts`, `src/lib/analyse.ts`, `src/lib/ratelimit.ts`, `src/pages/api/analyse.ts`, `tests/analyse-parse.test.ts`
- Modify: `src/lib/db.ts` (enquiry writes)

**Interfaces:**
- `POST {BASE}/api/analyse` body (JSON): `{ email, company?, text, attribution: object, website?: "" (honeypot) }`.
- Response: `text/event-stream` with events `meta` (`{id, kind}`), `delta` (`{html}`), `section` (`{key}`), `done` (`{id, cited, directors}`), `error` (`{code, message}`), and `: ping` comments every 5 s while no delta has been sent.
- Model output protocol (what the prompt demands): line 1 `KIND: script` or `KIND: brief` or `KIND: none`; then sections as `## ` headings in this exact order and wording for a script: `The read`, `Beat sheet`, `Runtime and format`, `Production breakdown`, `Three comparable films`, `Two directors`, `What we would push on`; for a brief: `The read`, `Three comparable films`, `Two directors`, `The questions we would ask`; then a final block `<<extracted>>{json}<<end>>` that the server strips and stores. Films only as `[[work:ID]]`, directors only as `[[director:SLUG]]`. Markdown restricted to headings, paragraphs, bullet lists, bold.

- [ ] **Step 1: Tests first** (`tests/analyse-parse.test.ts`): `parseHeader("KIND: brief\n## The read")` gives `brief`; the extracted-block stripper returns `{visible, extracted}` and holds back a partial `<<extr` tail across chunks; a `KIND: none` first line yields kind `none` and the rest is passed through as the refusal message.

- [ ] **Step 2: `src/lib/prompt.ts`**: `SYSTEM_PROMPT` (frozen string, no dates, no ids) plus `buildCandidateBlock(works: WorkRow[], directors: DirectorRow[]): string` (deterministic: sorted by id; each work rendered as `ID: <id> | <client> | <campaign> | <year> | format <format> | <duration>s | industry <...> | brief <brief_type> | device <narrative_device> | tone <...> | complexity <complexity> | flags <...> | celebrity <...> | awards <...> | confidence <...>\n<reference_for>` with **no slug and no URL**; directors as `SLUG: <slug> | <name> | credits: <up to 8 "client campaign year"> | <strengths>`). The system prompt content, in full:

```
You are the head of production at First December Films, a Mumbai ad film production house with a catalogue of about 160 films. A brand or agency has pasted a script or a brief. Write the analysis a producer would give a client before the first call: specific, honest, useful, and grounded only in the catalogue you are given.

Voice. British spelling. Plain sentences. Concrete over abstract. Vary sentence length. Never use an em dash or an en dash; use a comma, a colon or a full stop. Never write "not just X, it is Y", "seamlessly", "elevate", "in a world where", "delve", "testament", "moreover", "furthermore". No flattery, no closing platitudes. Do not address the reader as "you" more than necessary; write about the script.

Hard rules.
1. Films from the catalogue are referred to ONLY by the marker [[work:ID]] using an ID from the catalogue block. Never write a film's client, campaign or title in prose; the marker is rendered into a link by the server. Never invent a film. If fewer than three genuinely comparable films exist, say so plainly and cite fewer.
2. Directors ONLY by the marker [[director:SLUG]] from the directors block. Tie each suggestion to two named credits by marker. Never suggest a director who is not in the block.
3. No money. No rupee figures, no lakh, no crore, no INR, no ranges, no budget talk. Use the complexity band only: contained, standard or complex.
4. Do not write a treatment and do not rewrite the script.
5. If the input is not a script or a brief for a film, respond with "KIND: none" on the first line and one paragraph saying what the tool does and what to paste instead.

Output format. First line: "KIND: script" or "KIND: brief" or "KIND: none". Then markdown with exactly these "## " headings, in order.
For a script: The read / Beat sheet / Runtime and format / Production breakdown / Three comparable films / Two directors / What we would push on.
For a brief: The read / Three comparable films / Two directors / The questions we would ask.

Section notes.
The read: one paragraph, what this script actually is in plain terms, the device it relies on and the single thing it needs to land.
Beat sheet: the film's beats as the script implies them, one bullet per beat, present tense.
Runtime and format: an estimate with the reasoning visible (dialogue count, beats, cutdowns implied), and the format (TVC, digital film, anthem, series, brand film).
Production breakdown: locations (count and type), cast size, day or night, and flags for VFX, kids, animals, stunts, crowd, celebrity, water, period, vehicles. End with one line: "Complexity: contained" or standard or complex, and one sentence on what drives it.
Three comparable films: three bullets, each "[[work:ID]]: " followed by ONE specific sentence naming the shared device, tone or production problem. Prefer films with higher confidence. Never pad with a weak comparable.
Two directors: two bullets, each "[[director:SLUG]]: " followed by one or two sentences tied to two credits by [[work:ID]] marker.
What we would push on: three to five bullets. What is unclear, what will get expensive, where the idea is doing the least work, what a client will ask on the first call. Specific to this script. Do not soften.
The questions we would ask (briefs only): five to eight questions a producer needs answered before recommending anything, each one line.

After the last section, on its own line, output <<extracted>> followed by a single JSON object and then <<end>>. The JSON has keys: kind, format, estimated_runtime_seconds, locations, cast_size, day_night, flags (array), complexity, industry (array), device, tone (array), comparable_ids (array of IDs you cited), director_slugs (array), confidence ("high" | "medium" | "low" for how well the catalogue covered this input). Nothing after <<end>>.
```

- [ ] **Step 3: `src/lib/ratelimit.ts`**: `checkAndCount(kv, key, limit, windowSeconds)` using `get` then `put` with `expirationTtl`; keys `rl:e:<sha256(email lowercased)>` (3 per 24 h) and `rl:ip:<cf-connecting-ip>` (10 per 24 h); returns `{allowed, remaining}`.

- [ ] **Step 4: `src/lib/analyse.ts`** (the core; TypeScript SDK; streaming; caching on the system prompt and on the candidate block; `effort: "medium"`; no `thinking` param needed on `claude-opus-5`, adaptive by default; display omitted)

```ts
import Anthropic from "@anthropic-ai/sdk";
export async function runAnalysis(opts: {
  apiKey: string; input: string; kind: "script" | "brief" | "unknown"; works: WorkRow[]; directors: DirectorRow[];
  onText: (visible: string) => Promise<void> | void;    // visible text after ref-rewrite + sanitiser
}): Promise<{ rawText: string; visibleText: string; extracted: unknown; kind: string; cited: string[]; directors: string[]; usage: unknown }> {
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1 });
  const stream = client.messages.stream({
    model: "claude-opus-5",
    max_tokens: 6000,
    output_config: { effort: "medium" },
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: buildCandidateBlock(opts.works, opts.directors), cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: `Input classification hint: ${opts.kind}.\n\n<input>\n${opts.input}\n</input>` }],
  });
  // header parser -> extracted-block splitter -> ref rewriter -> sanitiser -> onText
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") pipeline.push(event.delta.text);
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") throw new AnalysisRefused();
  ...
}
```
The pipeline order matters: split header (first line) -> hold back `<<extracted>>...<<end>>` -> rewriter (markers to links) -> `sanitizeOutput` on completed sentences only (buffer to the last sentence end so a dash replacement never splits a token) -> markdown-to-HTML for the safe subset (headings, bullets, bold, paragraphs; links only those produced by the rewriter) -> `onText`.

- [ ] **Step 5: `src/pages/api/analyse.ts`**

```ts
export const config = { runtime: "edge" };
export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env, ctx = locals.runtime.ctx;
  // 1. parse + validate: email RFC-ish, text 40 to 12000 words, honeypot empty, attribution is a plain object under 4 KB
  // 2. rate limit: email + ip; 429 with a plain message on failure
  // 3. classify; if unknown and < 40 words: 422 { code: "not_a_script" }
  // 4. candidates = selectCandidates(env.DB, extractHints(text))
  // 5. id = crypto.randomUUID(); insertEnquiry(row with status 'new', candidate_ids)
  // 6. return SSE Response; inside start(): send meta, start ping interval, runAnalysis with onText -> delta events,
  //    on completion: send done, ctx.waitUntil(updateEnquiryOutput(...) then sendNotification(...))
  //    on error: send error event, waitUntil(update status 'error')
};
```
Store `input_hash = sha256(text)`; store attribution as received after `validateAttribution` (whitelist of 14 keys, each string under 512 chars).

- [ ] **Step 6: Local smoke test** with `.dev.vars` holding the key: `npm run preview`, POST a sample script with curl `-N`, watch events. Confirm `usage.cache_read_input_tokens > 0` on the second identical-candidate request (log usage server-side).

- [ ] **Step 7: Commit, push, staging deploy, repeat the smoke test on staging.** Add `ANTHROPIC_API_KEY` (Secret) to the staging environment first.

### Task 11: Twenty real scripts and briefs, read together

**Files:**
- Create: `scripts/briefs/01.txt` to `20.txt`, `scripts/run-briefs.ts`, `scripts/out/` (gitignored), `docs/phase2-outputs-<date>.md`

- [ ] **Step 1: Assemble 20 inputs**: 12 scripts and 8 briefs. Sources: the dialogue and beats reconstructed from the case-study bodies in `case-studies/out/*.body.html` (these are real FDF films, so the correct comparable is known and the tool's honesty can be judged), plus 6 written from scratch across industries FDF has not shot (a fintech explainer, a period drama, an animation-heavy kids film, a stunt-led auto film, a two-hander dialogue comedy, a festive anthem), plus 2 that are not scripts at all (a job ad, a product FAQ) to exercise the refusal path.
- [ ] **Step 2: `scripts/run-briefs.ts`** posts each to staging with `email=test+NN@1stdecember.com`, writes the visible text and the `extracted` JSON to `scripts/out/NN.md`, and appends everything to `docs/phase2-outputs-<date>.md` with the candidate count, cited ids resolved to titles (from `data/works-index.json`), and duration.
- [ ] **Step 3: Read all 20 with the owner.** Ask the two owed decisions here (shoot-day range or band only; gate before or after). Tune the prompt for bland "push on" sections or generic comparables, re-run, repeat. Delete the test enquiries via the admin endpoint afterwards. **Wait for "continue".**

---

# Phase 3. The front end

### Task 12: Match the site, build the page, stream the analysis

**Files:**
- Create: `src/styles/site.css`, `src/layouts/Base.astro`, `src/components/{Hero,Form,Analysis,Retention,Footer}.astro`, `src/pages/index.astro`, `src/pages/r/[id].astro`, `public/` assets
- Modify: none

- [ ] **Step 1: Extract the live site's type and colour**: fetch `https://cdn.prod.website-files.com/6a530ef3dd045382387c1010/css/first-december-films.webflow.shared.*.min.css` (URL from the home page HTML), and record in `docs/design-tokens.md`: the font families and the `@font-face` sources (self-host copies in `public/fonts/` if they are Webflow-uploaded, else the Google Fonts link), background and text colours, accent, heading sizes at 375 px and 1440 px, body line height, container widths, button style, link hover. Screenshot the home, `/work` and `/contact` pages at both widths for reference.

- [ ] **Step 2: `Base.astro`**: html lang en-GB, viewport, title, description, canonical `https://1stdecember.com/script`, favicon via `import.meta.env.ASSETS_PREFIX`, fonts, `site.css`, a minimal header (wordmark linking to `https://1stdecember.com`, one nav link to `/work` and `/contact`) and footer matching the site. No Lenis, no blend-mode header tricks; a plain header that reads as the same family.

- [ ] **Step 3: `index.astro` content** (all copy passes the dash scan):
  - Eyebrow: "Script analyser". H1: "Paste the script. See how we would make it." Sub: one sentence on what comes back and that it is grounded in FDF's own films.
  - Form: textarea (placeholder: "Paste a script or a brief. Scene directions, VO, dialogue, or a one-page brief all work."), email, company (optional), a hidden `website` honeypot, the retention statement with a required checkbox, a submit button "Analyse". Below the button, a short line: "Takes about a minute. Your script is not shared outside First December Films."
  - Analysis panel: hidden until submit, then a progress line ("Reading the script", "Finding comparable films", "Writing the notes", driven by `section` events), the streamed HTML, then the CTA "Talk to a producer" linking to `https://1stdecember.com/contact?ref=<id>` and a "Permanent link" to `/r/<id>`.
  - Client script: attribution (Step 4), `fetch(`${BASE}/api/analyse`, {method: "POST"})` reading the body as a stream, parsing SSE frames, appending `delta.html` with `insertAdjacentHTML`, scrolling gently, handling `error` with a plain message and `429` with "Three analyses per email per day".
- [ ] **Step 4: Attribution port.** Inline the touch-recording logic from `lead-attribution/2-site-head-attribution.html` verbatim (same keys `fdf_first_touch`, `fdf_last_touch`, `fdf_visits`, same channel rules), and replace the `fill()` form-filling with `window.fdfAttribution()` returning the same 14 fields with the same names (`Lead Source`, `First Touch`, `Last Touch`, `UTM Source`, `UTM Medium`, `UTM Campaign`, `UTM Content`, `UTM Term`, `Click ID`, `Referrer`, `Landing Page`, `Submitted From`, `Visit Count`, `Device`). The page is on the same origin as the site in production, so localStorage is shared; on staging the values will be staging-only, which is expected.
- [ ] **Step 5: Retention statement draft** (shown to the owner before launch; must be signed off word for word):
  > "What happens to your script. It is stored encrypted, read only by the First December Films production team, and never used to train any model. We keep it so we can follow up on your enquiry. Email hello@1stdecember.com with the reference and we delete it within two working days."
  (Replace the address with `NOTIFY_TO` once known.)
- [ ] **Step 6: `r/[id].astro`**: loads the enquiry, 404 if missing or `deleted_at`, renders `output_text` (already rewritten and sanitised at write time) with `<meta name="robots" content="noindex">` and header `X-Robots-Tag: noindex`. Shows the created date and the CTA. No email, no attribution.
- [ ] **Step 7: Mobile first.** Check at 375 px and 1440 px on staging in the app browser; textarea min-height 40vh on phones; sticky submit on phones; streamed headings not clipped. Send screenshots to the owner. **Wait for approval.**

---

# Phase 4. The log and the admin page

### Task 13: Notification email, admin list and detail, deletion path

**Files:**
- Create: `src/lib/email.ts`, `src/pages/admin/index.astro`, `src/pages/admin/[id].astro`, `src/pages/api/admin/enquiry.ts`
- Modify: `src/pages/api/analyse.ts` (call `sendNotification` in `waitUntil`)

- [ ] **Step 1: `email.ts`**: `sendEmail(env, {to, subject, text, html})` with providers selected by `EMAIL_PROVIDER`: `resend` (`POST https://api.resend.com/emails`), `brevo` (`POST https://api.brevo.com/v3/smtp/email`), `webhook` (POST JSON to `EMAIL_API_KEY`-authenticated URL, for a Google Apps Script or Zapier if the owner prefers). Plain `fetch`, 10 s timeout, errors logged not thrown.
- [ ] **Step 2: Notification content**: subject `Script enquiry: <company or email> (<kind>)`; body: email, company, kind, complexity, cited films (titles from D1), suggested directors, lead source and first/last touch, the admin link `https://1stdecember.com/script/admin/<id>?token=…` is NOT included (token in email is a leak); instead the result link `/script/r/<id>` and the enquiry id; then the full input text.
- [ ] **Step 3: Admin list** (`/admin`): `checkAdmin` via `?token=` on first visit, then set an `HttpOnly; Secure; SameSite=Strict` cookie holding the token so links work without the query string; table of enquiries newest first: date, email, company, kind, status, cited count; filter by status.
- [ ] **Step 4: Admin detail**: the input, the rendered output, attribution, a form with `status` select (new, replied, pitched, won, lost, shot, spam), `actual_director` (select of the 9 live directors plus "other" text), `became_work_id` (text, validated against `works.id` if set), `notes`; a "Delete script text" button that blanks `input_text`, `output_text`, `extracted` and sets `deleted_at` (row and outcome fields kept). POST to `api/admin/enquiry.ts`.
- [ ] **Step 5: Test submission on staging**: submit a real script, confirm the row (all attribution keys present), the email arrives at `NOTIFY_TO`, the admin page lists it, change status to won, reload, still won. Screenshot for the owner. **Wait for "continue".**

---

# Pre-launch reviews

- [ ] Run `/security-review` on the branch (input validation, SSE injection, admin auth, honeypot, rate limit, secrets never logged, `X-Robots-Tag`, no PII in URLs beyond the unguessable id).
- [ ] Run `/code-review`. Fix findings. Commit.
- [ ] Run `superpowers:verification-before-completion` before reporting each phase done.

---

# Phase 5. Go live (each outward step confirmed first)

### Task 14: Production environment, publish, verify, robots and sitemap, navigation

- [ ] **Step 1 (ask):** Create branch `production` from `main`; create the site-attached app `fdf-script` on site `6a530ef3dd045382387c1010` with environment `production`, branch `production`, mount `/script`, and copy the environment variables (secrets re-entered by hand). Confirm the D1 seed applied via `/script/api/admin/stats`.
- [ ] **Step 2 (ask):** Publish the Webflow site so the mount path routes. Before asking, list what else is unpublished in the site (Designer changes and staged CMS items, notably the 17 case studies) because a site publish pushes all of it.
- [ ] **Step 3:** Verify `https://1stdecember.com/script` in a private window: renders, mobile, submit a real script end to end, row lands with attribution, email arrives, admin page reachable, links to `/work/<slug>` and `/director/<slug>` resolve 200.
- [ ] **Step 4 (ask):** robots.txt. Read the current file from Webflow SEO settings first (the project copy at `robots.txt` is from 19 Aug). Add `Disallow: /script/api/`, `/script/admin`, `/script/r/` only inside the sitewide `User-agent: *` group and inside every named-bot group that has its own rules, because a named group replaces the sitewide rules for that bot. Do not add new no-op groups. Show the diff, apply after confirmation.
- [ ] **Step 5 (ask):** Sitemap. Webflow's auto sitemap will not know `/script`. Options: switch to a custom sitemap in SEO settings that includes the auto entries plus `/script`, or add `/script` to `llms.txt`. Show the change, apply after confirmation.
- [ ] **Step 6 (ask):** Navigation. Ask whether `/script` goes into the site nav and where (header, footer, or the contact page). Any Designer edit is done by the owner or via the MCP element tools, never by writing an embed's `code`.
- [ ] **Step 7:** Definition of done walk-through on a phone, logged out. Report with evidence. Save memory notes: environments, ids, the timeout finding, the rewriter contract.

---

## Self-review

- **Spec coverage**: Part A (Tasks 4 to 7), Part B (8 to 11), Part C (13), timeout verification (3), the two guardrails and the refusal path (8, 9, 10), retention statement and deletion path (12, 13), rate limits (10), twenty briefs (11), robots and sitemap (14), attribution (12). The spec's "plain language search across /work" is out of scope for this plan.
- **Additions beyond the spec, all small**: `directors` table, `is_published`, `token_usage`, `duration_ms`, `deleted_at`, result page `/r/[id]`, honeypot, admin reindex and stats endpoints, seed-by-migration. None changes what the client sees.
- **Type consistency**: `WorkRow`/`WorkRef` (Task 7/8), `createRefRewriter` (8, used in 10), `selectCandidates`/`extractHints` (9, used in 10), `sanitizeOutput` (9, used in 10 and 12), `checkAdmin` (7, used in 13).
