# Script analyser for 1stdecember.com

Public page where a brand or agency pastes a script or brief and gets a producer's analysis grounded in First December Films' 161-film catalogue, streamed live. FDF gets the script, the analysis and lead attribution by email and in an admin page. Design: `docs/2026-09-04-script-analyser-design.md`. Plan: `docs/2026-09-04-script-analyser-plan.md`. Current state and next steps: `docs/HANDOFF.md`.

## Stack

Astro 7.3 on Cloudflare Workers via Webflow Cloud, `@astrojs/cloudflare` 14, D1 (`DB`), KV (`RATE`), `@anthropic-ai/sdk` with `claude-opus-5`, vitest. Python 3.12 + yt-dlp + Webflow REST for the index build in `index/`.

## Commands

```
npm test                      # vitest, 73 tests, all pure modules
npx tsc --noEmit -p tsconfig.json
npx astro build
npm run db:local              # wrangler d1 migrations apply DB --local
npx astro preview --port 4321 # Workers runtime with local D1/KV, reads .dev.vars
node scripts/run-briefs.mjs [baseUrl] [prefix]   # the 20 acceptance inputs -> scripts/out, docs/phase2-outputs-<date>.md
node scripts/check-outputs.mjs                   # dashes, money, headings, citations over scripts/out
```

Index rebuild after CMS changes, in order, from `index/`: `fetch_cms.py`, `fetch_youtube.py` (throttled, resumable), `extract.py` (hash-aware, only re-calls Claude for changed items), `build_directors.py`, `emit_seed.py` (writes a delta migration against `data/works-index.json`; `0002_seed_works.sql` is frozen). Then `review_sample.py <date>` for the owner's ten-row check.

## Hard rules

- No em dashes (U+2014) or en dashes (U+2013) in anything a client reads. Scan with `chr(8212)`/`chr(8211)`. British spelling. No "not just X, it is Y", "seamlessly", "elevate", "delve", "testament", "in a world where", "moreover", "furthermore".
- The model never names a film. It emits `[[work:ID]]` / `[[director:SLUG]]`; `src/lib/refs.ts` renders links only from D1 rows in the request's allowed set and drops everything else. `tests/refs.test.ts` asserts this. Keep it that way.
- No rupee figures ever. `src/lib/sanitize.ts` drops any sentence with money tokens; the prompt forbids them. Complexity band only.
- Only the 9 live directors are ever suggested or linked. Shivin & Sunny, Roopali Singhal and Suraj Wanvari are archived and must never appear (`director_slug` is null on their films).
- Never write to the `code` setting of a Webflow HTML Embed. Never modify Works CMS content. Nothing goes live (site publish, mount path, robots, sitemap, nav) without Divyansh's explicit yes.
- Secrets by path only, never printed: `~/.secrets/webflow-token.txt`, `~/.secrets/anthropic-key-1st-december-films.txt`, `~/.secrets/fdf-admin-token.txt`, `~/.secrets/brevo-api-key-1st-dec-films.txt`. `.dev.vars` holds the local copies and is gitignored.

## Webflow Cloud contract (Astro 7)

- Bindings and env vars: `import { env } from "cloudflare:workers"`. `locals.runtime.env` and `Astro.clientAddress` throw. Execution context: `locals.cfContext.waitUntil(...)`.
- `wrangler.json` has no `main`; placeholder ids; Webflow injects real ones per environment. Migrations auto-apply on deploy; there is no remote D1 shell.
- The worker sees an internal host; use `src/lib/request.ts` (`publicOrigin` from `x-wf-original-host` allow-listed to our hosts, `clientIp` from `x-wf-clientip`, relative `redirectTo`). Astro `security.checkOrigin` is off for that reason; admin POSTs are protected by the token cookie (SameSite=Strict) or a Bearer header.
- 20 s idle timeout on the response body: the analyse route sends `meta` at once and a `: ping` comment every 5 s until text flows.
- Deploys: push to the tracked branch, about 2.5 min. Env var changes need a redeploy. `main` -> staging app `https://fdf-script-staging.webflow.io` (standalone). `production` -> the site-attached app at `1stdecember.com/script` (Phase 5).

## Tooling quirks on this machine

- The Bash tool's heredocs break on an unbalanced apostrophe or complex quoting; put multi-line patches in a `.py` file under the scratchpad and run it, or use the Write/Edit tools.
- npm 10.9 needs `--legacy-peer-deps` for vitest 5. Wrangler 4.129 wants `@cloudflare/workers-types` v5.
- Brevo: Authorised IPs must stay deactivated for API keys (Workers egress from rotating IPs). Verified sender is `hello@1stdecember.com`; `src/lib/email.ts` falls back to the first verified sender if `EMAIL_FROM` is not verified.
