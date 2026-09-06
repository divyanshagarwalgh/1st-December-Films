# Handoff, 6 September 2026

State of the script analyser build at the end of the first session. Read `CLAUDE.md` first, then this.

## Where things are

| Thing | Where |
|---|---|
| Repo | `https://github.com/divyanshagarwalgh/1st-December-Films` (public; private recommended). Local clone `D:\Claude desktop\1st December Films\script-analyser`. |
| Branches | `main` = staging. `production` = created from main on 6 Sep, tracked by nothing yet. |
| Staging app | `https://fdf-script-staging.webflow.io`, standalone Webflow Cloud app `fdf-script-staging`, tracks `main`, mount `/`. Env vars set: ANTHROPIC_API_KEY, ADMIN_TOKEN, EMAIL_PROVIDER=brevo, EMAIL_API_KEY, EMAIL_FROM=hello@1stdecember.com, NOTIFY_TO (mail@, ganeshpareek@, imranpatel@, ankitsingh@ at 1stdecember.com, typed as shorthand; the parser completes them). |
| Health | `GET /api/health` shows D1/KV, row counts, which secrets are present, the public origin and IP header the worker resolves. |
| Admin | `/admin?token=<ADMIN_TOKEN>` once, then a cookie for 30 days. `/admin/<id>` for status (new, replied, pitched, won, lost, shot, spam, error), actual director, became work (validated), notes, delete script text, delete row. Scripted calls: `Authorization: Bearer <token>` (also bypasses the rate limit on `/api/analyse`). |
| Stats | `GET /api/admin/stats` with the token. |
| Re-index | `POST /api/admin/reindex` with the token, body `{works, directors}` from `data/works-index.json` and `data/directors.json`, or ship a delta migration (preferred, `index/emit_seed.py`). |
| Index | 161 works, 9 directors, confidence high 59 / medium 80 / low 22. Notes in `docs/index-notes.md`, review sample `docs/index-review-2026-09-05.md`. |
| Twenty outputs | `docs/phase2-outputs-2026-09-05.md`, read and approved by Divyansh. Inputs in `scripts/briefs/`. |
| Timeout finding | `docs/2026-09-05-timeout-finding.md`: the 20 s is an idle timeout on the body; streaming stands. |
| Retention statement | `docs/retention-statement.md`, signed off word for word. Deletion address mail@1stdecember.com. |
| Cost | Index build about $4.22. One analysis about $0.33 cold, $0.12 with a warm cache. Credits $50 with auto-reload on the Anthropic org. |

## Decisions taken (Divyansh said "decide for me" where noted)

- Complexity band only, no shoot-day range (decided for him).
- Email gate before the analysis renders (decided for him).
- Malaysia Airlines is co-directed: Ronak Chugh and Atul Kattukaran (his call). `CO_DIRECTED` map in `index/build_directors.py`, delta migration `0003`.
- Notifications through Brevo from `hello@1stdecember.com` (verified sender) to the four FDF addresses.
- Prompt caching as the spec describes: candidate block per request (5 min TTL), system prompt (1 h). Cache hits happen when consecutive requests share a filter bucket.

## What each phase delivered

0. Timeout probes, finding recorded. Staging app created by Divyansh in the deploy wizard.
1. Index: `index/*.py`, `migrations/0002_seed_works.sql` (frozen), `0003_reindex_2026-09-05.sql` (Malaysia), `data/*.json` snapshots.
2. Analyser: `src/pages/api/analyse.ts` (validate, honeypot, KV rate limit 3 per email and 10 per IP per day, prefilter widening to 40+, capped at 90, director credit rows join the allowed set, streaming SSE with `meta`/`kind`/`section`/`delta`/`done`/`error`, tee to D1, email in waitUntil). Pipeline in `src/lib/`: `protocol.ts` -> `render.ts` escapeHtml -> `refs.ts` -> `sanitize.ts` -> `render.ts` renderer. Prompt in `src/lib/prompt.ts`. Failure classification (billing/auth -> unavailable, 429/5xx -> busy).
3. Page `src/pages/index.astro` matched to the site (fonts, grain, wordmark from the live CSS), form collapses on submit and the analysis streams at the top with a sticky status line, Start over, attribution ported from the site head script (same localStorage keys), result page `src/pages/r/[id].astro` (noindex). Approved on desktop and phone.
4. Email `src/lib/email.ts` (Brevo/Resend/webhook, self-healing sender), admin pages, deletion path, migration `0004` (notified_at, notify_error). Test send reached Brevo (201) to hello@1stdecember.com; Divyansh had not yet confirmed receipt in the inbox when the session ended.
Reviews: security (two low findings fixed: emailed link host allow-list, strict address shape) and code review (eight findings fixed). 73 tests green at commit `dd0c947`.

## Phase 5, the exact steps (each outward step needs Divyansh's yes)

1. Divyansh creates the production app in the Webflow deploy wizard (https://webflow.com/dashboard/cloud/deploy): Import a GitHub repository, `divyanshagarwalgh/1st-December-Films`, branch `production`, target **Existing site** = First December Films, mount path `/script`, app name `fdf-script`. Add the environment variables BEFORE the first deploy: ANTHROPIC_API_KEY (Secret), ADMIN_TOKEN (Secret), EMAIL_API_KEY (Secret), EMAIL_PROVIDER=brevo, EMAIL_FROM=hello@1stdecember.com, NOTIFY_TO, SITE_ORIGIN=https://1stdecember.com. Values are in the files under `~/.secrets/`.
2. If Webflow refuses a second app on the same repo, delete the staging app first (it holds nothing that matters; staging D1 is empty).
3. Deploy. Check `https://1stdecember.com/script/api/health` shows works 161, directors 9, hasKey, hasAdmin, hasEmail, public_origin `https://1stdecember.com`.
4. Site publish, only with an explicit yes. A site publish pushes every staged Designer and CMS change. Before asking, list what is unpublished (Webflow REST: items with `lastPublished` older than `lastUpdated`; note the case studies written 4 Sep). The site was last published 4 Sep 17:08 UTC.
5. Verify logged out on a phone: paste a script, watch it stream, click a work link and a director link, row lands with attribution, email arrives, admin shows it, change status to won.
6. robots.txt: read the live file from Webflow SEO settings first. Add `Disallow: /script/api/`, `/script/admin`, `/script/r/` inside the sitewide `User-agent: *` group AND inside every named-bot group that has its own rules (a named group replaces the sitewide rules for that bot; the file has ~60 no-op `Allow: /` groups, see memory `fdf-robots-txt-group-precedence-bug`). Show the diff, apply on yes.
7. Sitemap: Webflow's auto sitemap will not include `/script`; switch to a custom sitemap that adds it, or add it to `llms.txt`. Ask.
8. Navigation: ask where `/script` goes (header, footer, contact page). Designer edits by Divyansh or via MCP element tools, never by writing an embed's code.
9. Record the usage allotment (Site settings, Usage, Plan usage) in `docs/webflow-cloud-allotment.md`; ask him to make the repo private.

## Open questions for Divyansh

- Did the Phase 4 test email reach hello@1stdecember.com?
- Usage numbers from Site settings, Usage.
- Repo visibility.
- Whether the four NOTIFY_TO addresses are right for launch (deletion promise depends on those inboxes being read).

## Known limitations, on purpose

- The model can still name a film in prose if it ignores the instruction; only markers are structurally guarded. Not seen in 20 runs.
- Sanitiser works per sentence, so streaming releases text at sentence or line boundaries, not per token.
- KV rate limit windows refresh on each request (a fourth attempt within 24 h of the last one is refused).
- Deleting a script from the database does not recall the notification email; the admin page tells staff to delete it from the inbox.
