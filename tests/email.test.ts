import { describe, it, expect } from "vitest";
import { parseRecipients, buildNotification, pickSender } from "../src/lib/email";

describe("parseRecipients", () => {
  it("splits on commas and semicolons and trims", () => {
    expect(parseRecipients("a@x.com, b@x.com ;c@x.com")).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
  });
  it("treats the word and as a separator and completes bare local parts with the first domain", () => {
    expect(parseRecipients("mail@1stdecember.com, ganeshpareek@, imranpatel@ and ankitsingh@")).toEqual([
      "mail@1stdecember.com",
      "ganeshpareek@1stdecember.com",
      "imranpatel@1stdecember.com",
      "ankitsingh@1stdecember.com",
    ]);
  });
  it("drops anything that is still not an address and dedupes", () => {
    expect(parseRecipients("a@x.com, nonsense, a@x.com")).toEqual(["a@x.com"]);
    expect(parseRecipients("")).toEqual([]);
    expect(parseRecipients(undefined)).toEqual([]);
  });
});

describe("buildNotification", () => {
  const n = buildNotification({
    id: "de849adc-8dfe-4bbb-85c4-9c02ba50b9ac",
    email: "client@brand.com",
    company: "Brand & Co",
    kind: "script",
    complexity: "complex",
    cited: ["Nike, Make Every Yard Count (2014)"],
    directors: ["Atul Kattukaran"],
    attribution: { "Lead Source": "linkedin / social", "Landing Page": "/script?utm_source=linkedin", "Visit Count": "2" },
    resultUrl: "https://1stdecember.com/script/r/de849adc-8dfe-4bbb-85c4-9c02ba50b9ac",
    inputText: "INT. KITCHEN <b>bold</b>",
  });
  it("names the sender in the subject and carries the reference", () => {
    expect(n.subject).toBe("Script enquiry: Brand & Co (script, complex)");
    expect(n.text).toContain("Reference de849adc");
    expect(n.text).toContain("client@brand.com");
    expect(n.text).toContain("https://1stdecember.com/script/r/de849adc-8dfe-4bbb-85c4-9c02ba50b9ac");
  });
  it("escapes the script in the html body", () => {
    expect(n.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(n.html).not.toContain("<b>bold</b>");
    expect(n.html).toContain("Brand &amp; Co");
  });
  it("contains no em or en dashes", () => {
    const EM = String.fromCharCode(8212), EN = String.fromCharCode(8211);
    expect(n.subject + n.text + n.html).not.toMatch(new RegExp(`[${EM}${EN}]`));
  });
});

describe("pickSender", () => {
  const verified = [{ email: "divyanshgraphic@gmail.com", active: true }, { email: "old@x.com", active: false }];
  it("uses the wanted address when Brevo has verified it", () => {
    expect(pickSender("hello@1stdecember.com", [...verified, { email: "hello@1stdecember.com", active: true }])).toEqual({ email: "hello@1stdecember.com", fallback: false });
  });
  it("falls back to the first active verified sender when the wanted one is not verified", () => {
    expect(pickSender("hello@1stdecember.com", verified)).toEqual({ email: "divyanshgraphic@gmail.com", fallback: true });
  });
  it("matches case-insensitively", () => {
    expect(pickSender("Hello@1stDecember.com", [{ email: "hello@1stdecember.com", active: true }])).toEqual({ email: "hello@1stdecember.com", fallback: false });
  });
  it("returns the wanted address when the list is unavailable, so the send is still attempted", () => {
    expect(pickSender("hello@1stdecember.com", null)).toEqual({ email: "hello@1stdecember.com", fallback: false });
  });
});
