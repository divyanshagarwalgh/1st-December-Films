# Script analyser for 1stdecember.com

The engine behind `1stdecember.com/script`: a Webflow Cloud app (Astro on the Cloudflare Workers runtime) mounted at `/analyser`. The page itself is built in the Webflow Designer and loads `/analyser/embed.js`; a brand or agency pastes a script or a brief and receives an analysis grounded in First December Films' own catalogue. Notifications go through Webflow's native form submission; the app sends no email.

Design: `docs/2026-09-04-script-analyser-design.md`. Plan: `docs/2026-09-04-script-analyser-plan.md`.

## Local run

```
npm install
npm run db:local
npm run preview
```

Copy `.dev.vars.example` to `.dev.vars` and fill in values for local runs. Never commit secrets.
