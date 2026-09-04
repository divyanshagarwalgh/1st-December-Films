export const config = { runtime: "edge" };
import type { APIRoute } from "astro";
import { sse, headers } from "./_sse";
// Headers immediately, one event per second for 45 seconds.
export const GET: APIRoute = () => new Response(sse(45, 0, null, 0), { headers });
