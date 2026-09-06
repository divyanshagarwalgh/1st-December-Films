import { describe, it, expect } from "vitest";
import { publicOrigin, clientIp, isPublicEmail, redirectTo } from "../src/lib/request";

const env = { SITE_ORIGIN: "https://1stdecember.com" };
const req = (headers: Record<string, string>, url = "https://abc.wf-app-prod.cosmic.webflow.services/api/analyse") => new Request(url, { headers });

describe("publicOrigin", () => {
  it("uses Webflow's forwarded host when it is one of ours", () => {
    expect(publicOrigin(req({ "x-wf-original-host": "fdf-script-staging.webflow.io" }), env)).toBe("https://fdf-script-staging.webflow.io");
    expect(publicOrigin(req({ "x-wf-original-host": "1stdecember.com" }), env)).toBe("https://1stdecember.com");
    expect(publicOrigin(req({ "x-wf-original-host": "www.1stdecember.com" }), env)).toBe("https://www.1stdecember.com");
  });
  it("ignores a forwarded host that is not ours, and never trusts Origin or Referer", () => {
    expect(publicOrigin(req({ "x-wf-original-host": "1stdecember-com.example.net" }), env)).toBe("https://1stdecember.com");
    expect(publicOrigin(req({ origin: "https://attacker.example", referer: "https://attacker.example/x" }), env)).toBe("https://1stdecember.com");
    expect(publicOrigin(req({ "x-wf-original-host": "evil.webflow.io.example.com" }), env)).toBe("https://1stdecember.com");
  });
  it("falls back to APP_ORIGIN before SITE_ORIGIN", () => {
    expect(publicOrigin(req({}), { APP_ORIGIN: "https://fdf-script-staging.webflow.io", SITE_ORIGIN: "https://1stdecember.com" })).toBe("https://fdf-script-staging.webflow.io");
  });
});

describe("clientIp", () => {
  it("prefers Webflow's client ip header and takes the first of a forwarded list", () => {
    expect(clientIp(req({ "x-wf-clientip": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 8.8.8.8" }))).toEqual({ ip: "1.2.3.4", header: "x-wf-clientip" });
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 8.8.8.8" }))).toEqual({ ip: "9.9.9.9", header: "x-forwarded-for" });
    expect(clientIp(req({}))).toEqual({ ip: null, header: null });
  });
});

describe("isPublicEmail", () => {
  it("accepts ordinary addresses", () => {
    for (const a of ["a@b.co", "first.last+tag@sub.example.com", "x_y-z@agency-name.in", "TEST@EXAMPLE.ORG"]) expect(isPublicEmail(a)).toBe(true);
  });
  it("rejects mailto and header metacharacters", () => {
    for (const a of ["lead@brand.com?bcc=x%40evil.com", "a@b.com&subject=hi", 'a"b@c.com', "a<b@c.com", "a@b", "a b@c.com", "a@b..com", "@c.com", "a@@c.com", "a@c.com\r\nBcc: x"]) expect(isPublicEmail(a)).toBe(false);
  });
});

describe("redirectTo", () => {
  it("is a relative 303 so the browser stays on the public host", () => {
    const r = redirectTo("/script/admin?ok=saved");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/script/admin?ok=saved");
  });
});
