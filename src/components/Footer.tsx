import Link from "next/link";
import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="bg-[#f7f7f8] text-[#6b6b76] text-sm px-4 pt-10 pb-24 sm:pb-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:justify-between gap-8">
          <div className="flex items-center gap-2 text-lg font-extrabold text-[#1c1c1f]">
            <Logo />
            Viralo<span className="text-[#ff5a1f]">.shop</span>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href="/ueber-uns" className="hover:text-[#1c1c1f] underline">Über uns</Link>
            <Link href="/agb" className="hover:text-[#1c1c1f] underline">AGB</Link>
            <Link href="/datenschutz" className="hover:text-[#1c1c1f] underline">Datenschutz</Link>
            <Link href="/kontakt" className="hover:text-[#1c1c1f] underline">Kontakt</Link>
          </nav>
        </div>
        <div className="mt-8 bg-[#fdeee8] border border-[#ff5a1f]/30 text-[#1c1c1f] text-xs rounded-xl p-3 text-center">
          Dies ist ein Spiel/Demo – es werden keine echten Bestellungen ausgelöst und kein Geld eingezogen.
        </div>
        <p className="mt-4 text-xs text-center text-[#6b6b76]">
          © {new Date().getFullYear()} Viralo.shop — Demo-Onlineshop
        </p>
      </div>
    </footer>
  );
}
