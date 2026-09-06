// The styles for the streamed analysis, served as a file so the Designer page links one stylesheet.
import type { APIRoute } from "astro";
import source from "../client/embed.css?raw";

export const GET: APIRoute = () =>
  new Response(source, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=300" } });
