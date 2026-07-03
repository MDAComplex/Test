"use client";

// Suchfeld mit Autocomplete: debounced Fetch auf /api/search-suggest,
// Dropdown mit Vorschlägen, Enter führt die normale Suche aus.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search } from "lucide-react";

type Suggestion = { id: string; name: string };

export default function SearchBox({ className = "" }: { className?: string }) {
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-suggest?q=${encodeURIComponent(term)}`);
        if (!res.ok) return;
        const data: Suggestion[] = await res.json();
        setSuggestions(data);
        setOpen(true);
      } catch {
        // Vorschläge sind optional — Fehler still ignorieren.
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  // Dropdown schließen bei Klick außerhalb.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <form
        action="/search"
        method="GET"
        onSubmit={() => setOpen(false)}
        className="flex items-center bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-2 py-1.5 focus-within:border-[#ff5a1f]"
      >
        <Search size={16} className="text-[#6b6b76] shrink-0" />
        <input
          type="text"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Suchen..."
          autoComplete="off"
          className="bg-transparent text-sm px-2 outline-none w-full"
        />
      </form>
      {open && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e5e5e8] rounded-xl shadow-lg overflow-hidden z-50">
          {suggestions.map((s) => (
            <Link
              key={s.id}
              href={`/product/${s.id}`}
              onClick={() => {
                setOpen(false);
                setQ("");
              }}
              className="block px-3 py-2 text-sm hover:bg-[#f4f4f5] text-[#1c1c1f] truncate"
            >
              {s.name}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
            className="block w-full text-left px-3 py-2 text-sm text-[#ff5a1f] font-medium hover:bg-[#f4f4f5] border-t border-[#e5e5e8]"
          >
            Alle Ergebnisse für &quot;{q.trim()}&quot;
          </button>
        </div>
      )}
    </div>
  );
}
