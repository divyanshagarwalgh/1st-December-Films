export const config = { runtime: "edge" };
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { clientIp, publicOrigin } from "../../lib/request";

export const GET: APIRoute = async ({ request }) => {
  let d1 = "missing";
  let kv = "missing";
  let works = 0;
  let directors = 0;
  try {
    const [w, d] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM works").first<{ n: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM directors").first<{ n: number }>(),
    ]);
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
  const body = {
    d1, kv, works, directors, base: import.meta.env.BASE_URL, hasKey: Boolean(env.ANTHROPIC_API_KEY), hasAdmin: Boolean(env.ADMIN_TOKEN),
    seen: { url_host: new URL(request.url).host, public_origin: publicOrigin(request, env), client_ip_header: clientIp(request).header },
  };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
};
