/**
 * Webflow Cloud runs the app on an internal host (<id>.wf-app-prod.cosmic.webflow.services) and
 * does not forward the public host or the client IP as Cloudflare normally would. These helpers
 * are the single place that knows that.
 */
const INTERNAL_HOST = /\.webflow\.services$/i;

/** Hosts this app is ever served from. Anything else in a forwarded-host header is ignored. */
const OUR_HOSTS = [/^1stdecember\.com$/i, /^www\.1stdecember\.com$/i, /^[a-z0-9-]+\.webflow\.io$/i];

export function isInternalHost(host: string): boolean {
  return INTERNAL_HOST.test(host);
}

export function isOurHost(host: string): boolean {
  return OUR_HOSTS.some((re) => re.test(host));
}

/**
 * The origin a visitor actually used, for links we email to staff. Only Webflow's forwarded host is
 * consulted, and only when it is one of ours; Origin and Referer are attacker-controlled and never used.
 */
export function publicOrigin(request: Request, env: { APP_ORIGIN?: string; SITE_ORIGIN?: string }): string {
  const wfHost = (request.headers.get("x-wf-original-host") || "").trim().toLowerCase();
  if (wfHost && isOurHost(wfHost)) return `https://${wfHost}`;
  const self = new URL(request.url);
  if (self.protocol === "https:" && isOurHost(self.host)) return self.origin;
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

/**
 * A conservative address shape for visitor emails: ordinary local parts and hostnames only, so the
 * value can be stored, put in a mailto: link and used as a Reply-To without carrying query
 * parameters or header breaks.
 */
const EMAIL = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isPublicEmail(s: string): boolean {
  return s.length <= 254 && EMAIL.test(s) && !s.includes("..");
}

/** A relative redirect so the browser stays on the public host it came from. */
export function redirectTo(location: string, status = 303): Response {
  return new Response(null, { status, headers: { location } });
}
