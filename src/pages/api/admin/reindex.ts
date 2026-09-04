export const config = { runtime: "edge" };
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAdmin } from "../../../lib/auth";
import { upsertDirectors, upsertWorks, type DirectorRow, type WorkRow } from "../../../lib/db";

/** POST { works: WorkRow[], directors: DirectorRow[] } with the admin token. Upserts the index. */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAdmin(request, env.ADMIN_TOKEN)) return new Response("forbidden", { status: 403 });
  let body: { works?: WorkRow[]; directors?: DirectorRow[] };
  try {
    body = await request.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const works = await upsertWorks(env.DB, body.works ?? []);
  const directors = await upsertDirectors(env.DB, body.directors ?? []);
  return new Response(JSON.stringify({ works, directors }), { headers: { "content-type": "application/json" } });
};
