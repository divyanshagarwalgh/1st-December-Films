/** Admin page gate: accepts ?token= once and sets an HttpOnly cookie so links work without the query string. */
import type { AstroCookies } from "astro";
import { checkAdmin, timingSafeEqual } from "./auth";

export function adminGate(request: Request, cookies: AstroCookies, token: string | undefined, basePath: string): { ok: boolean; setCookie: boolean } {
  if (!token || token.length < 16) return { ok: false, setCookie: false };
  const url = new URL(request.url);
  const q = url.searchParams.get("token");
  if (q && timingSafeEqual(q, token)) {
    cookies.set("fdf_admin", token, { httpOnly: true, secure: url.protocol === "https:", sameSite: "strict", path: basePath || "/", maxAge: 60 * 60 * 24 * 30 });
    return { ok: true, setCookie: true };
  }
  return { ok: checkAdmin(request, token), setCookie: false };
}
