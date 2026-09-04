/** Constant-time comparison of a supplied admin token (Bearer header, ?token=, or cookie) against ADMIN_TOKEN. */
export function extractToken(request: Request): string {
  const h = request.headers.get("authorization") || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim();
  const url = new URL(request.url);
  const q = url.searchParams.get("token");
  if (q) return q;
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)fdf_admin=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkAdmin(request: Request, token: string | undefined): boolean {
  if (!token || token.length < 16) return false;
  return timingSafeEqual(extractToken(request), token);
}
