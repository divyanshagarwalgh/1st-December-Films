export const config = { runtime: "edge" };
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ request }) => {
  let d1 = "missing";
  let kv = "missing";
  let works = 0;
  let directors = 0;
  try {
    const w = await env.DB.prepare("SELECT COUNT(*) AS n FROM works").first<{ n: number }>();
    const d = await env.DB.prepare("SELECT COUNT(*) AS n FROM directors").first<{ n: number }>();
    works = w?.n ?? 0;
    directors = d?.n ?? 0;
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
  const h = (n: string) => request.headers.get(n);
  const body = {
    d1, kv, works, directors, base: import.meta.env.BASE_URL, hasKey: Boolean(env.ANTHROPIC_API_KEY), hasAdmin: Boolean(env.ADMIN_TOKEN),
    hasEmail: Boolean(env.EMAIL_PROVIDER && env.EMAIL_API_KEY && env.NOTIFY_TO),
    seen: { url_host: new URL(request.url).host, host: h("host"), x_forwarded_host: h("x-forwarded-host"), x_forwarded_proto: h("x-forwarded-proto"), origin: h("origin"), cf_connecting_ip: h("cf-connecting-ip") ? "present" : null },
  };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
};
