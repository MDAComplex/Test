// Einfaches In-Memory-Rate-Limiting (Sliding Window pro Key).
// Hinweis: Der Zähler lebt nur pro Server-Instanz/Prozess — für diese Demo
// völlig ausreichend, für Produktion müsste ein zentraler Store (Redis) her.

const buckets = new Map<string, number[]>();

/**
 * Wirft einen Fehler, wenn `key` innerhalb von `windowMs` öfter als `limit`
 * verwendet wurde. Sonst wird der Versuch gezählt.
 */
export function assertRateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const timestamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    throw new Error("Zu viele Versuche, bitte später erneut.");
  }
  timestamps.push(now);
  buckets.set(key, timestamps);

  // Gelegentlich aufräumen, damit die Map nicht unbegrenzt wächst.
  if (buckets.size > 5000) {
    for (const [k, ts] of buckets) {
      if (ts.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
}
