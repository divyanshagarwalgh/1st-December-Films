// The client for the /script page, served as a file so the Designer page carries one script tag.
// Webflow rewrites Cache-Control to private, no-cache on every response, so the header here is a
// statement of intent rather than a promise.
import type { APIRoute } from "astro";
import source from "../client/embed.js?raw";

export const GET: APIRoute = () =>
  new Response(source, { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "public, max-age=300" } });
