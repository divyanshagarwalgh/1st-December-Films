export const config = { runtime: "edge" };
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async () => {
  let d1 = "missing";
  let kv = "missing";
  try {
    await env.DB.prepare("SELECT 1").first();
    d1 = "ok";
  } catch (e) {
    d1 = "error: " + (e as Error).message;
  }
  try {
    await env.RATE.get("health");
    kv = "ok";
  } catch (e) {
    kv = "error: " + (e as Error).message;
  }
  const body = { d1, kv, base: import.meta.env.BASE_URL, hasKey: Boolean(env.ANTHROPIC_API_KEY) };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
};
