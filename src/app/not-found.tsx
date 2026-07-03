import Link from "next/link";
import Logo from "@/components/Logo";
import SearchBox from "@/components/SearchBox";
import { Home, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-20 text-center">
      <div className="flex justify-center mb-6">
        <Logo size={56} />
      </div>
      <p className="text-sm font-bold text-[#ff5a1f] mb-2">Fehler 404</p>
      <h1 className="text-3xl font-extrabold mb-3">Seite nicht gefunden</h1>
      <p className="text-[#6b6b76] mb-8">
        Diese Seite gibt es leider nicht (mehr). Vielleicht findest du dein
        Lieblingsprodukt über die Suche?
      </p>
      <div className="max-w-md mx-auto mb-8">
        <SearchBox />
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 bg-[#ff5a1f] text-white px-5 py-3 rounded-xl font-semibold hover:opacity-90 glow-accent"
        >
          <Home size={16} /> Zur Startseite
        </Link>
        <Link
          href="/kategorien"
          className="flex items-center gap-2 bg-white border border-[#e5e5e8] text-[#1c1c1f] px-5 py-3 rounded-xl font-semibold hover:border-[#ff5a1f]"
        >
          <Compass size={16} /> Kategorien entdecken
        </Link>
      </div>
    </div>
  );
}
