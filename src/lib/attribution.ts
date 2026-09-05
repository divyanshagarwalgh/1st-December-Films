/** The same fourteen fields the site's contact form carries, nothing else, each capped in length. */
export const ATTRIBUTION_KEYS = [
  "Lead Source", "First Touch", "Last Touch", "UTM Source", "UTM Medium", "UTM Campaign", "UTM Content", "UTM Term",
  "Click ID", "Referrer", "Landing Page", "Submitted From", "Visit Count", "Device",
] as const;

export type Attribution = Partial<Record<(typeof ATTRIBUTION_KEYS)[number], string>>;

export function validateAttribution(input: unknown): Attribution {
  const out: Attribution = {};
  if (!input || typeof input !== "object") return out;
  for (const k of ATTRIBUTION_KEYS) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v === "string" && v.length) out[k] = v.slice(0, 512);
  }
  return out;
}
