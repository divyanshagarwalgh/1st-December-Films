/**
 * Webflow Cloud runs the app on an internal host (<id>.wf-app-prod.cosmic.webflow.services) and
 * does not forward the public host or the client IP as Cloudflare normally would. These helpers
 * are the single place that knows that.
 */
const INTERNAL_HOST = /\.webflow\.services$/i;

export function isInternalHost(host: string): boolean {
  return INTERNAL_HOST.test(host);
}

/** The origin a visitor actually used: the browser's Origin or Referer, else the configured site origin. */
export function publicOrigin(request: Request, env: { APP_ORIGIN?: string; SITE_ORIGIN?: string }): string {
  // Webflow Cloud forwards the host the visitor used in its own header.
  const wfHost = request.headers.get("x-wf-original-host");
  if (wfHost && /^[a-z0-9.-]+$/i.test(wfHost) && !isInternalHost(wfHost)) return `https://${wfHost}`;
  for (const name of ["origin", "referer"]) {
    const v = request.headers.get(name);
    if (!v) continue;
    try {
      const u = new URL(v);
      if (u.protocol === "https:" && !isInternalHost(u.host)) return u.origin;
    } catch {
      /* not a url */
    }
  }
  const self = new URL(request.url);
  if (self.protocol === "https:" && !isInternalHost(self.host)) return self.origin;
  return env.APP_ORIGIN || env.SITE_ORIGIN || "https://1stdecember.com";
}

const IP_HEADERS = ["x-wf-clientip", "cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for", "x-client-ip"];

/** The client IP if any proxy layer passed one; null otherwise (callers must not treat null as one shared bucket). */
export function clientIp(request: Request): { ip: string | null; header: string | null } {
  for (const h of IP_HEADERS) {
    const v = request.headers.get(h);
    if (v) {
      const first = v.split(",")[0].trim();
      if (first) return { ip: first, header: h };
    }
  }
  return { ip: null, header: null };
}

/** A relative redirect so the browser stays on the public host it came from. */
export function redirectTo(location: string, status = 303): Response {
  return new Response(null, { status, headers: { location } });
}
