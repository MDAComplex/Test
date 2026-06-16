import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CATEGORIES } from "@/lib/categories";
import { getRank, touchDailyLogin } from "@/lib/rewards";
import { ShoppingCart, Home, Gift, Package, Settings, User, Search, Heart, Coins } from "lucide-react";
import Logo from "@/components/Logo";

export default async function Navbar() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string; email?: string } | undefined;

  let cartCount = 0;
  let coins = 0;

  if (user?.id) {
    await touchDailyLogin(user.id);
    const [items, dbUser] = await Promise.all([
      prisma.cartItem.findMany({ where: { userId: user.id } }),
      prisma.user.findUnique({ where: { id: user.id } }),
    ]);
    cartCount = items.reduce((s, i) => s + i.quantity, 0);
    coins = dbUser?.coins ?? 0;
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[#e5e5e8] text-[#1c1c1f]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
            <Logo />
            Viralo<span className="text-[#ff5a1f]">.shop</span>
          </Link>
          <nav className="hidden md:flex gap-1 overflow-x-auto text-sm flex-1 scrollbar-none">
            {CATEGORIES.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="px-2 py-1 rounded-lg hover:bg-[#f4f4f5] whitespace-nowrap text-[#6b6b76] hover:text-[#1c1c1f]"
              >
                {c.name}
              </Link>
            ))}
          </nav>
          <form action="/search" method="GET" className="hidden md:flex items-center bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-2 py-1.5 w-48">
            <Search size={16} className="text-[#6b6b76] shrink-0" />
            <input
              type="text"
              name="q"
              placeholder="Suchen..."
              className="bg-transparent text-sm px-2 outline-none w-full"
            />
          </form>
          <div className="flex items-center gap-3 ml-auto md:ml-0">
            {user && (
              <Link
                href="/rewards"
                className="hidden sm:flex items-center gap-1 bg-[#f4f4f5] border border-[#e5e5e8] rounded-full px-3 py-1 text-sm"
              >
                <Coins size={14} className="text-[#1faa59]" />
                <span className="text-[#1faa59] font-bold">{coins}</span>
                <span className="text-[#6b6b76]">Coins</span>
              </Link>
            )}
            {user && (
              <Link href="/favoriten" className="relative px-2 hidden sm:inline-block" aria-label="Favoriten">
                <Heart size={20} className="text-[#1c1c1f]" />
              </Link>
            )}
            <Link href="/cart" className="relative px-2 hidden sm:inline-block">
              <ShoppingCart size={20} className="text-[#1c1c1f]" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#ff5a1f] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {cartCount}
                </span>
              )}
            </Link>
            {user?.role === "ADMIN" && (
              <Link href="/admin" className="flex items-center gap-1 px-3 py-1 bg-[#1c1c1f] text-white rounded-lg font-semibold text-sm">
                <Settings size={14} /> Admin
              </Link>
            )}
            {session?.user ? (
              <Link
                href="/account"
                className="flex items-center justify-center w-9 h-9 rounded-full bg-[#f4f4f5] border border-[#e5e5e8] hover:border-[#ff5a1f]"
                aria-label="Mein Konto"
              >
                <User size={18} className="text-[#1c1c1f]" />
              </Link>
            ) : (
              <Link href="/login" className="text-sm bg-[#ff5a1f] text-white px-4 py-1.5 rounded-lg font-semibold">
                Login
              </Link>
            )}
          </div>
        </div>
        <form action="/search" method="GET" className="md:hidden flex items-center bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-2 py-1.5 mx-4 mb-3">
          <Search size={16} className="text-[#6b6b76] shrink-0" />
          <input
            type="text"
            name="q"
            placeholder="Suchen..."
            className="bg-transparent text-sm px-2 outline-none w-full"
          />
        </form>
      </header>

      {user && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white border-t border-[#e5e5e8] flex justify-around py-2 text-xs text-[#6b6b76]">
          <Link href="/" className="flex flex-col items-center gap-0.5 px-2">
            <Home size={18} /> Home
          </Link>
          <Link href="/cart" className="flex flex-col items-center gap-0.5 px-2 relative">
            <ShoppingCart size={18} /> Warenkorb
            {cartCount > 0 && (
              <span className="absolute -top-0.5 right-1 bg-[#ff5a1f] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </Link>
          <Link href="/favoriten" className="flex flex-col items-center gap-0.5 px-2">
            <Heart size={18} /> Favoriten
          </Link>
          <Link href="/rewards" className="flex flex-col items-center gap-0.5 px-2">
            <Gift size={18} /> Rewards
          </Link>
          <Link href="/orders" className="flex flex-col items-center gap-0.5 px-2">
            <Package size={18} /> Bestellungen
          </Link>
          {user.role === "ADMIN" && (
            <Link href="/admin" className="flex flex-col items-center gap-0.5 px-2 text-[#1c1c1f]">
              <Settings size={18} /> Admin
            </Link>
          )}
          <Link href="/account" className="flex flex-col items-center gap-0.5 px-2">
            <User size={18} /> Profil
          </Link>
        </nav>
      )}
    </>
  );
}
