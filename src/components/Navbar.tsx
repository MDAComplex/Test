import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CATEGORIES } from "@/lib/categories";
import { getRank, touchDailyLogin } from "@/lib/rewards";

export default async function Navbar() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string; email?: string } | undefined;

  let cartCount = 0;
  let coins = 0;
  let rankEmoji = "";

  if (user?.id) {
    await touchDailyLogin(user.id);
    const [items, dbUser] = await Promise.all([
      prisma.cartItem.findMany({ where: { userId: user.id } }),
      prisma.user.findUnique({ where: { id: user.id } }),
    ]);
    cartCount = items.reduce((s, i) => s + i.quantity, 0);
    coins = dbUser?.coins ?? 0;
    const { current } = getRank(coins);
    rankEmoji = current.emoji;
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#16161d]/95 backdrop-blur border-b border-[#2c2c38] text-[#f4f4f8]">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link href="/" className="text-xl font-extrabold tracking-tight">
            Viralo<span className="text-[#ff2d92]">.shop</span>
          </Link>
          <nav className="hidden md:flex gap-1 overflow-x-auto text-sm flex-1 scrollbar-none">
            {CATEGORIES.map((c) => (
              <Link
                key={c.slug}
                href={`/category/${c.slug}`}
                className="px-2 py-1 rounded-lg hover:bg-[#22222c] whitespace-nowrap text-[#9b9bab] hover:text-[#f4f4f8]"
              >
                {c.emoji} {c.name}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 ml-auto">
            {user && (
              <Link
                href="/rewards"
                className="hidden sm:flex items-center gap-1 bg-[#22222c] border border-[#2c2c38] rounded-full px-3 py-1 text-sm"
              >
                <span className="text-[#00f0c0] font-bold">{coins}</span>
                <span className="text-[#9b9bab]">Coins</span>
                <span className="ml-1">{rankEmoji}</span>
              </Link>
            )}
            <Link href="/cart" className="relative px-2 hidden sm:inline-block">
              🛒
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#ff2d92] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                  {cartCount}
                </span>
              )}
            </Link>
            {user?.role === "ADMIN" && (
              <Link href="/admin" className="px-3 py-1 bg-[#00f0c0] text-black rounded-full font-semibold text-sm">
                Admin
              </Link>
            )}
            {session?.user ? (
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
                className="hidden sm:block"
              >
                <button className="text-sm bg-[#22222c] px-3 py-1 rounded-full">Logout</button>
              </form>
            ) : (
              <Link href="/login" className="text-sm bg-[#ff2d92] px-4 py-1.5 rounded-full font-semibold">
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      {user && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 sm:hidden bg-[#16161d] border-t border-[#2c2c38] flex justify-around py-2 text-xs text-[#9b9bab]">
          <Link href="/" className="flex flex-col items-center gap-0.5 px-2">
            <span className="text-lg">🏠</span> Home
          </Link>
          <Link href="/cart" className="flex flex-col items-center gap-0.5 px-2 relative">
            <span className="text-lg">🛒</span> Warenkorb
            {cartCount > 0 && (
              <span className="absolute -top-0.5 right-1 bg-[#ff2d92] text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </Link>
          <Link href="/rewards" className="flex flex-col items-center gap-0.5 px-2">
            <span className="text-lg">🎁</span> Rewards
          </Link>
          <Link href="/orders" className="flex flex-col items-center gap-0.5 px-2">
            <span className="text-lg">📦</span> Bestellungen
          </Link>
          {user.role === "ADMIN" ? (
            <Link href="/admin" className="flex flex-col items-center gap-0.5 px-2 text-[#00f0c0]">
              <span className="text-lg">⚙️</span> Admin
            </Link>
          ) : (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
              className="flex flex-col items-center gap-0.5 px-2"
            >
              <button type="submit" className="flex flex-col items-center gap-0.5">
                <span className="text-lg">🚪</span> Logout
              </button>
            </form>
          )}
        </nav>
      )}
    </>
  );
}
