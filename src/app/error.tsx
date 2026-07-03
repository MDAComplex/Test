"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { RefreshCcw, Home } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <div className="flex justify-center mb-6">
        <Logo size={56} />
      </div>
      <h1 className="text-3xl font-extrabold mb-3">Ups, da ist etwas schiefgelaufen</h1>
      <p className="text-[#6b6b76] mb-2">
        Ein unerwarteter Fehler ist aufgetreten. Keine Sorge — dein Warenkorb und
        deine Coins sind sicher.
      </p>
      {error.digest && (
        <p className="text-xs text-[#6b6b76] mb-6">Fehlercode: {error.digest}</p>
      )}
      <div className="flex flex-wrap justify-center gap-3 mt-6">
        <button
          onClick={() => reset()}
          className="flex items-center gap-2 bg-[#ff5a1f] text-white px-5 py-3 rounded-xl font-semibold hover:opacity-90 glow-accent"
        >
          <RefreshCcw size={16} /> Erneut versuchen
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 bg-white border border-[#e5e5e8] text-[#1c1c1f] px-5 py-3 rounded-xl font-semibold hover:border-[#ff5a1f]"
        >
          <Home size={16} /> Zur Startseite
        </Link>
      </div>
    </div>
  );
}
