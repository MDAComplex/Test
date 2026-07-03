import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { touchDailyLogin } from "@/lib/rewards";
import { guestCartCount } from "@/lib/guestCart";
import { ShoppingCart, Home, Gift, Package, Settings, User, Heart, Coins, Bell, ChevronDown } from "lucide-react";
import Logo from "@/components/Logo";
import SearchBox from "@/components/SearchBox";

// So viele Kategorien werden direkt in der Leiste gezeigt — der Rest wandert
// in das "Alle Kategorien"-Dropdown (nichts wird mehr mitten im Wort abgeschnitten).
const VISIBLE_CATEGORIES = 5;

export default async function Navbar() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string; email?: string } | undefined;

  let cartCount = 0;
  let coins = 0;
  let unreadCount = 0;

  if (user?.id) {
    await touchDailyLogin(user.id);
    const [items, dbUser, unread] = await Promise.all([
      prisma.cartItem.findMany({ where: { userId: user.id } }),
      prisma.user.findUnique({ where: { id: user.id } }),
      prisma.notification.count({ where: { userId: user.id, read: false } }),
    ]);
    cartCount = items.reduce((s, i) => s + i.quantity, 0);
    coins = dbUser?.coins ?? 0;
    unreadCount = unread;
  } else {
    // Gäste: Warenkorb-Badge aus dem Cookie-Warenkorb.
    cartCount = await guestCartCount();
  }

  // Kategorien live aus der DB (Admin kann sie anlegen/umbenennen/löschen).
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const visible = categories.slice(0, VISIBLE_CATEGORIES);
  const overflow = categories.slice(VISIBLE_CATEGORIES);

  return (
    <>
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[#e5e5e8] text-[#1c1c1f]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2 text-xl font-extrabold tracking-tight shrink-0">
            <Logo />
            Viralo<span className="text-[#ff5a1f]">.shop</span>
          </Link>

          <nav className="hidden lg:flex items-center gap-1 text-sm flex-1 min-w-0">
            {visible.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="px-2 py-1 rounded-lg hover:bg-[#f4f4f5] whitespace-nowrap text-[#6b6b76] hover:text-[#1c1c1f]"
              >
                {c.name}
              </Link>
            ))}
            {/* CSS-only Dropdown über details/summary */}
            <details className="relative group">
              <summary className="list-none cursor-pointer px-2 py-1 rounded-lg hover:bg-[#f4f4f5] whitespace-nowrap text-[#6b6b76] hover:text-[#1c1c1f] flex items-center gap-1 select-none">
                Alle Kategorien <ChevronDown size={14} />
              </summary>
              <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5e5e8] rounded-xl shadow-lg py-2 w-56 z-50">
                {overflow.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/category/${c.slug}`}
                    className="block px-4 py-1.5 text-[#6b6b76] hover:text-[#1c1c1f] hover:bg-[#f4f4f5]"
                  >
                    {c.name}
                  </Link>
                ))}
                <Link
                  href="/kategorien"
                  className="block px-4 py-1.5 mt-1 border-t border-[#e5e5e8] pt-2 text-[#ff5a1f] font-medium hover:bg-[#f4f4f5]"
                >
                  Übersicht aller Kategorien
                </Link>
              </div>
            </details>
          </nav>

          <SearchBox className="hidden md:block w-56 lg:w-64 ml-auto lg:ml-0" />

          <div className="flex items-center gap-2 ml-auto md:ml-0">
            {user && (
              <Link
                href="/rewards"
                className="hidden sm:flex items-center gap-1 bg-[#f4f4f5] border border-[#e5e5e8] rounded-full px-3 py-1 text-sm hover:border-[#1faa59]"
              >
                <Coins size={14} className="text-[#1faa59]" />
                <span className="text-[#1faa59] font-bold">{coins}</span>
                <span className="text-[#6b6b76]">Coins</span>
              </Link>
            )}
            {user && (
              <Link href="/notifications" className="relative p-2 rounded-lg hover:bg-[#f4f4f5]" aria-label="Benachrichtigungen">
                <Bell size={20} className="text-[#1c1c1f]" />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 bg-[#ff5a1f] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            {user && (
              <Link href="/favoriten" className="hidden sm:block p-2 rounded-lg hover:bg-[#f4f4f5]" aria-label="Favoriten">
                <Heart size={20} className="text-[#1c1c1f]" />
              </Link>
            )}
            <Link href="/cart" className="relative hidden sm:block p-2 rounded-lg hover:bg-[#f4f4f5]" aria-label="Warenkorb">
              <ShoppingCart size={20} className="text-[#1c1c1f]" />
              {cartCount > 0 && (
                <span className="absolute top-0 right-0 bg-[#ff5a1f] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {cartCount > 9 ? "9+" : cartCount}
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
              <Link href="/login" className="text-sm bg-[#ff5a1f] text-white px-4 py-1.5 rounded-lg font-semibold hover:opacity-90">
                Login
              </Link>
            )}
          </div>
        </div>
        <div className="md:hidden px-4 pb-3">
          <SearchBox />
        </div>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-white border-t border-[#e5e5e8] flex justify-around py-2 text-xs text-[#6b6b76]">
        <Link href="/" className="flex flex-col items-center gap-0.5 px-2">
          <Home size={18} /> Home
        </Link>
        <Link href="/cart" className="flex flex-col items-center gap-0.5 px-2 relative">
          <ShoppingCart size={18} /> Warenkorb
          {cartCount > 0 && (
            <span className="absolute -top-0.5 right-1 bg-[#ff5a1f] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
              {cartCount > 9 ? "9+" : cartCount}
            </span>
          )}
        </Link>
        {user ? (
          <>
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
          </>
        ) : (
          <>
            <Link href="/kategorien" className="flex flex-col items-center gap-0.5 px-2">
              <Package size={18} /> Kategorien
            </Link>
            <Link href="/login" className="flex flex-col items-center gap-0.5 px-2">
              <User size={18} /> Login
            </Link>
          </>
        )}
      </nav>
    </>
  );
}
