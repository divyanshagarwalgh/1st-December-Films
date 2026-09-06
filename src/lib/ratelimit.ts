/** Rolling counters in KV. Eventually consistent, which is fine for abuse control. */
export const LIMITS = { email: 3, ip: 10, windowSeconds: 24 * 60 * 60 };

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function checkAndCount(kv: KVNamespace, key: string, limit: number, windowSeconds = LIMITS.windowSeconds): Promise<{ allowed: boolean; count: number }> {
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) || 0 : 0;
  if (count >= limit) return { allowed: false, count };
  await kv.put(key, String(count + 1), { expirationTtl: windowSeconds });
  return { allowed: true, count: count + 1 };
}

export async function rateLimit(kv: KVNamespace, email: string, ip: string | null): Promise<{ allowed: boolean; reason?: "email" | "ip" }> {
  const e = await checkAndCount(kv, "rl:e:" + (await sha256Hex(email.trim().toLowerCase())), LIMITS.email);
  if (!e.allowed) return { allowed: false, reason: "email" };
  if (ip) {
    // Only when a real client address is known; a missing header must never become one shared bucket.
    const i = await checkAndCount(kv, "rl:ip:" + ip, LIMITS.ip);
    if (!i.allowed) return { allowed: false, reason: "ip" };
  }
  return { allowed: true };
}
