export const config = { runtime: "edge" };
import type { APIRoute } from "astro";
import { sse, headers } from "./_sse";
// First byte only after 25 seconds, then 20 events.
export const GET: APIRoute = () => new Response(sse(20, 25000, null, 0), { headers });
