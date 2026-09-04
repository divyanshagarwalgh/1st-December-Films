export const config = { runtime: "edge" };
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAdmin } from "../../../lib/auth";
import { indexStats } from "../../../lib/db";

export const GET: APIRoute = async ({ request }) => {
  if (!checkAdmin(request, env.ADMIN_TOKEN)) return new Response("forbidden", { status: 403 });
  const stats = await indexStats(env.DB);
  return new Response(JSON.stringify(stats), {
    headers: { "content-type": "application/json", "x-robots-tag": "noindex" },
  });
};
