"use client";

import { useEffect, useState } from "react";

/**
 * Tickender hh:mm:ss-Countdown bis `endsAt` (ISO-String). Zeigt "Beendet" bei 0.
 * Erster Render (SSR) zeigt Platzhalter, um Hydration-Mismatches zu vermeiden.
 */
export default function Countdown({ endsAt, className }: { endsAt: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (now === null) {
    return <span className={className} suppressHydrationWarning>--:--:--</span>;
  }

  const totalSeconds = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 1000));
  if (totalSeconds <= 0) return <span className={className}>Beendet</span>;

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className={className} suppressHydrationWarning>
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}
