/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

// Bindings come from `import { env } from "cloudflare:workers"` (Astro 6+ adapter contract).
// `wrangler types` regenerates worker-configuration.d.ts with the bindings in wrangler.json;
// the environment variables set in Webflow Cloud are declared here so `env.X` is typed.
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    RATE: KVNamespace;
    ANTHROPIC_API_KEY?: string;
    ADMIN_TOKEN?: string;
    NOTIFY_TO?: string;
    EMAIL_PROVIDER?: string;
    EMAIL_API_KEY?: string;
    EMAIL_FROM?: string;
    SITE_ORIGIN?: string;
  }
}

declare namespace App {
  interface Locals {
    cfContext: ExecutionContext;
  }
}
