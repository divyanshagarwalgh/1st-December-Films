# Script analyser for 1stdecember.com

A Webflow Cloud app (Astro on the Cloudflare Workers runtime) mounted at `/script`. A brand or agency pastes a script or a brief and receives an analysis grounded in First December Films' own catalogue.

Design: `docs/2026-09-04-script-analyser-design.md`. Plan: `docs/2026-09-04-script-analyser-plan.md`.

## Local run

```
npm install
npm run db:local
npm run preview
```

Copy `.dev.vars.example` to `.dev.vars` and fill in values for local runs. Never commit secrets.
