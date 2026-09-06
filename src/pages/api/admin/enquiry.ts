export const config = { runtime: "edge" };
import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { checkAdmin } from "../../../lib/auth";
import { blankEnquiryScript, deleteEnquiry, getEnquiry, updateEnquiryStatus } from "../../../lib/db";
import { redirectTo } from "../../../lib/request";

export const STATUSES = ["new", "replied", "pitched", "won", "lost", "shot", "spam", "error"] as const;

/** Form POST from the admin detail page: status update, blank the script text, or delete the row. */
export const POST: APIRoute = async ({ request }) => {
  if (!checkAdmin(request, env.ADMIN_TOKEN)) return new Response("forbidden", { status: 403 });
  const form = await request.formData();
  const id = String(form.get("id") || "");
  const action = String(form.get("action") || "status");
  const base = (import.meta.env.BASE_URL || "").replace(/\/$/, "");
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await getEnquiry(env.DB, id))) return new Response("not found", { status: 404 });
  if (action === "blank") {
    await blankEnquiryScript(env.DB, id);
    return redirectTo(`${base}/admin/${id}?ok=blanked`);
  }
  if (action === "delete") {
    await deleteEnquiry(env.DB, id);
    return redirectTo(`${base}/admin?ok=deleted`);
  }
  const status = String(form.get("status") || "new");
  if (!(STATUSES as readonly string[]).includes(status)) return new Response("bad status", { status: 400 });
  const clean = (k: string, max: number) => {
    const v = String(form.get(k) || "").trim().slice(0, max);
    return v || null;
  };
  const becameWork = clean("became_work_id", 40);
  if (becameWork) {
    const exists = await env.DB.prepare("SELECT 1 FROM works WHERE id = ? OR slug = ?").bind(becameWork, becameWork).first();
    if (!exists) return new Response("became_work_id must be a works id or slug", { status: 400 });
  }
  await updateEnquiryStatus(env.DB, id, {
    status,
    actual_director: clean("actual_director", 80),
    became_work_id: becameWork,
    notes: clean("notes", 4000),
  });
  return redirectTo(`${base}/admin/${id}?ok=saved`);
};
