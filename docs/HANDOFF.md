# Handoff, 6 September 2026 (updated during the second session)

State of the script analyser build. Read `CLAUDE.md` first, then this.

## The one decision of the second session

Divyansh asked whether the page could live in the Webflow Designer so he controls copy, sections and SEO himself. Answer: yes, and it is the better shape. Recorded in `CLAUDE.md` under "Page and engine". In short: the Designer page `script` is the page; this app is the engine at `/analyser`. Nothing about the analysis pipeline changed. What changed in the repo:

- `src/pages/index.astro` is now a 302 to `/script`.
- `src/client/embed.js` and `src/client/embed.css`, served by `src/pages/embed.js.ts` and `src/pages/embed.css.ts`. The JS derives the app path from its own script tag, stops Webflow's form handler in the capture phase, reads the fourteen attribution inputs the site's head script injects, and marks the textarea `data-lenis-prevent`.
- `src/pages/r/[id].astro`: "Analyse another script" points at `/script`.
- `docs/designer-page-build-sheet.md`: the page settings, every element and id, the approved copy, the new section copy and FAQ for review, and the JSON-LD to paste. `tests/embed.test.ts` ties the ids in the script to the sheet.
- `docs/robots-proposed-2026-09-06.txt` beside `docs/robots-live-2026-09-06.txt`: the robots.txt to paste at step 6, already repointed to `/analyser`.

## Where things are

| Thing | Where |
|---|---|
| Repo | `https://github.com/divyanshagarwalgh/1st-December-Films` (public; private recommended). Local clone `D:\Claude desktop\1st December Films\script-analyser`. |
| Branches | `main` = staging. `production` = the site-attached app; kept equal to `main` by fast-forward. |
| Staging app | `https://fdf-script-staging.webflow.io`, standalone Webflow Cloud app `fdf-script-staging`, tracks `main`, mount `/`. All env vars set. Its root redirects to `/script`, which does not exist on that host; use it for `/api/health`, the admin, and `/embed.js`. |
| Production app | `fdf-script`, tracks `production`, Existing site First December Films, mount `/analyser`, the seven env vars entered in the wizard on 6 Sep (ANTHROPIC_API_KEY, ADMIN_TOKEN, EMAIL_API_KEY as secrets; EMAIL_PROVIDER=brevo, EMAIL_FROM=hello@1stdecember.com, NOTIFY_TO with the four full addresses, SITE_ORIGIN=https://1stdecember.com). Deployed 6 Sep and reachable at once on `https://1stdecember.com/analyser` and `https://first-december-films.webflow.io/analyser` with no site publish (health 200, base `/analyser`, public_origin resolved per host). A push to `production` is therefore public within minutes; there is no staging gate on the custom domain. |
| The page | Designer page `Script`, slug `script`, created 6 Sep with the site header and footer, nothing else yet. Build from `docs/designer-page-build-sheet.md`. |
| Health | `GET <mount>/api/health` shows D1/KV, row counts, which secrets are present, `base`, the public origin and IP header the worker resolves. |
| Admin | `<mount>/admin?token=<ADMIN_TOKEN>` once, then a cookie for 30 days scoped to the mount. `<mount>/admin/<id>` for status (new, replied, pitched, won, lost, shot, spam, error), actual director, became work, notes, delete script text, delete row. Scripted calls: `Authorization: Bearer <token>` (also bypasses the rate limit on `/api/analyse`). |
| Stats | `GET <mount>/api/admin/stats` with the token. |
| Re-index | `POST <mount>/api/admin/reindex` with the token, body `{works, directors}` from `data/works-index.json` and `data/directors.json`, or ship a delta migration (preferred, `index/emit_seed.py`). |
| Index | 161 works, 9 directors, confidence high 59 / medium 80 / low 22. Notes in `docs/index-notes.md`, review sample `docs/index-review-2026-09-05.md`. |
| Twenty outputs | `docs/phase2-outputs-2026-09-05.md`, read and approved by Divyansh. Inputs in `scripts/briefs/`. |
| Timeout finding | `docs/2026-09-05-timeout-finding.md`: the 20 s is an idle timeout on the body; streaming stands. |
| Retention statement | `docs/retention-statement.md`, signed off word for word; now pasted into the Designer page, see the build sheet. Deletion address mail@1stdecember.com. |
| Cost | Index build about $4.22. One analysis about $0.33 cold, $0.12 with a warm cache. Credits $50 with auto-reload on the Anthropic org. |

## Pre-flight done on 6 Sep (second session)

- `production` equalled `main` at `114b69d`; tree clean; 73 tests, tsc and `astro build` green (a leftover `astro preview` from the first session was holding `dist`, killed).
- Base-path audit: every link, fetch, form action, redirect, cookie path and emailed URL is built from `BASE_URL`.
- Nothing unpublished on the site: 0 of 28 pages and 0 of 475 CMS items changed since the 4 Sep 17:08 UTC publish (script in the session scratchpad; re-run with the Webflow REST `lastUpdated` vs `lastPublished` check before any publish).
- Search Console in the connected account has only webyansh.com, so `/script` cannot be submitted from here; Divyansh submits it in his own Search Console if he has the property.
- The site has an `llms.txt` (200); read it before step 7.
- After the refactor: 78 tests green, tsc clean, build clean, local preview smoke: `/` 302 to `/script`, `/embed.js` 200 text/javascript, `/embed.css` 200 text/css, `/api/health` 200, `/r/<bad>` 404.
- Embed tested end to end on the local preview through the staff reference page `src/pages/admin/preview.astro` (token-gated, every id from the build sheet, loads the served files): tiffin script pasted, seven sections streamed, three film links and two director links rendered, CTA and reference set, Start over restores the form with the text kept, result page noindex with the link back to `/script`, row in D1 with attribution (fallback fields only; the site head script supplies the fourteen on the real page). One bug found and fixed on the way: a root mount derived an empty base that the fallback replaced with `/analyser`; now unit-tested. Local runs must blank `EMAIL_PROVIDER` in `.dev.vars` or the four FDF inboxes get the test.

## Decisions taken (Divyansh said "decide for me" where noted)

- Complexity band only, no shoot-day range (decided for him).
- Email gate before the analysis renders (decided for him).
- Malaysia Airlines is co-directed: Ronak Chugh and Atul Kattukaran (his call). `CO_DIRECTED` map in `index/build_directors.py`, delta migration `0003`.
- Notifications through Brevo from `hello@1stdecember.com` (verified sender) to the four FDF addresses.
- Prompt caching as the spec describes: candidate block per request (5 min TTL), system prompt (1 h). Cache hits happen when consecutive requests share a filter bucket.
- Page in the Designer, app as the engine at `/analyser` (his call, 6 Sep, after a comparison on SEO/AEO, flexibility, UX, performance, scalability and ownership).

## What each phase delivered

0. Timeout probes, finding recorded. Staging app created by Divyansh in the deploy wizard.
1. Index: `index/*.py`, `migrations/0002_seed_works.sql` (frozen), `0003_reindex_2026-09-05.sql` (Malaysia), `data/*.json` snapshots.
2. Analyser: `src/pages/api/analyse.ts` (validate, honeypot, KV rate limit 3 per email and 10 per IP per day, prefilter widening to 40+, capped at 90, director credit rows join the allowed set, streaming SSE with `meta`/`kind`/`section`/`delta`/`done`/`error`, tee to D1, email in waitUntil). Pipeline in `src/lib/`: `protocol.ts` -> `render.ts` escapeHtml -> `refs.ts` -> `sanitize.ts` -> `render.ts` renderer. Prompt in `src/lib/prompt.ts`. Failure classification (billing/auth -> unavailable, 429/5xx -> busy).
3. Page, first as `src/pages/index.astro` matched to the site, approved on desktop and phone; on 6 Sep its markup, copy and client script moved to the Designer page plus `src/client/embed.js`. Result page `src/pages/r/[id].astro` (noindex) stays in the app.
4. Email `src/lib/email.ts` (Brevo/Resend/webhook, self-healing sender), admin pages, deletion path, migration `0004` (notified_at, notify_error). Test send reached Brevo (201) to hello@1stdecember.com; Divyansh had not yet confirmed receipt in the inbox.
Reviews: security (two low findings fixed: emailed link host allow-list, strict address shape) and code review (eight findings fixed).

## Phase 5, the exact steps (each outward step needs Divyansh's yes)

1. Production app: wizard filled on 6 Sep with mount `/analyser` and the seven variables (screenshot verified). Waiting for his "done" on Deploy. If Webflow refuses a second app on the same repo, tell him before deleting the staging app (it holds nothing that matters).
2. Push this session's commit to `main` and fast-forward `production` so the engine deploys with the redirect and the embed files.
3. Divyansh builds the `script` page from `docs/designer-page-build-sheet.md`. He reviews the new section copy and FAQ there first. Head code and footer code carry the two tags; JSON-LD goes in the page's structured data field.
4. Site publish, only with an explicit yes. Re-run the unpublished check first; on 6 Sep nothing was pending, so the publish carries the page and the mount only. Then check `https://1stdecember.com/analyser/api/health` shows works 161, directors 9, hasKey, hasAdmin, hasEmail, base `/analyser`, public_origin `https://1stdecember.com`, and `https://1stdecember.com/analyser` redirects to `/script`.
5. Verify logged out on a phone: paste a script, watch it stream, click a work link and a director link, row lands with the fourteen attribution fields, email arrives, admin shows it, change status to won. Also confirm Webflow's own form handler did not fire (no "Thank you" state, no submission in the Webflow Forms tab).
6. robots.txt: paste `docs/robots-proposed-2026-09-06.txt` into Site settings > SEO > robots.txt on his yes. It removes the 63 no-op per-bot groups (which silently stripped named bots of the sitewide rules), keeps the blocked groups, and repeats the Disallow lines inside the three audit exceptions. Verify with `curl -sS https://1stdecember.com/robots.txt` after publish.
7. Sitemap: the Designer page is in the auto sitemap, so nothing to switch. Add `/script` to `llms.txt` (read the live file first) and ask him to request indexing in his Search Console.
8. Navigation: ask where `/script` goes (header, footer, contact page). Designer edits by Divyansh or via MCP element tools, never by writing an embed's code.
9. Record the usage allotment (Site settings, Usage, Plan usage) in `docs/webflow-cloud-allotment.md`; ask him to make the repo private.

## Open questions for Divyansh

- Did the Phase 4 test email reach hello@1stdecember.com?
- Usage numbers from Site settings, Usage.
- Repo visibility.
- Whether the four NOTIFY_TO addresses are right for launch (deletion promise depends on those inboxes being read).
- Review of the section copy and FAQ in the build sheet.

## Known limitations, on purpose

- The model can still name a film in prose if it ignores the instruction; only markers are structurally guarded. Not seen in 20 runs.
- Sanitiser works per sentence, so streaming releases text at sentence or line boundaries, not per token.
- KV rate limit windows refresh on each request (a fourth attempt within 24 h of the last one is refused).
- Deleting a script from the database does not recall the notification email; the admin page tells staff to delete it from the inbox.
- The page and the engine are two homes for the interactive part. Adding a form field means a new id in the Designer and in `embed.js`, and the sheet.
