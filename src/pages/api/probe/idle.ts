export const config = { runtime: "edge" };
import type { APIRoute } from "astro";
import { sse, headers } from "./_sse";
// Events 1 to 9, then 25 seconds of silence, then events 10 to 40.
export const GET: APIRoute = () => new Response(sse(40, 0, 10, 25000), { headers });
