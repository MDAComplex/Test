import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CATEGORIES } from "@/lib/categories";

export default async function Navbar() {
  const session = await auth();
  const user = session?.user as { id?: string; role?: string; email?: string } | undefined;

  let cartCount = 0;
  if (user?.id) {
    const items = await prisma.cartItem.findMany({ where: { userId: user.id } });
    cartCount = items.reduce((s, i) => s + i.quantity, 0);
  }

  return (
    <header className="sticky top-0 z-50 bg-violet-700 text-white shadow">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link href="/" className="text-2xl font-extrabold tracking-tight">
          Viralo<span className="text-amber-300">.shop</span>
        </Link>
        <nav className="hidden md:flex gap-1 overflow-x-auto text-sm flex-1">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/category/${c.slug}`}
              className="px-2 py-1 rounded hover:bg-violet-600 whitespace-nowrap"
            >
              {c.emoji} {c.name}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 ml-auto">
          <Link href="/cart" className="relative px-2">
            🛒
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-amber-400 text-violet-900 text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </Link>
          {user?.role === "ADMIN" && (
            <Link href="/admin" className="px-3 py-1 bg-amber-400 text-violet-900 rounded font-semibold text-sm">
              Admin
            </Link>
          )}
          {session?.user ? (
            <>
              <Link href="/orders" className="text-sm hidden sm:inline">
                Meine Bestellungen
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="text-sm bg-violet-800 px-3 py-1 rounded">Logout</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="text-sm bg-violet-800 px-3 py-1 rounded">
              Login
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
