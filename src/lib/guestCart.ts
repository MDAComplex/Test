// Cookie-basierter Gast-Warenkorb: Gäste können shoppen, ohne sich anzumelden.
// Der Warenkorb wird als JSON-Array in einem httpOnly-Cookie gespeichert und
// beim Login/bei der Registrierung in den DB-Warenkorb übernommen (Merge).
import { cookies } from "next/headers";

export const GUEST_CART_COOKIE = "guest_cart";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 Tage

export type GuestCartItem = { productId: string; quantity: number };

/** Liest den Gast-Warenkorb aus dem Cookie (Pages + Server Actions). */
export async function readGuestCart(): Promise<GuestCartItem[]> {
  const store = await cookies();
  const raw = store.get(GUEST_CART_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (i): i is GuestCartItem =>
          !!i && typeof i.productId === "string" && typeof i.quantity === "number" && i.quantity > 0
      )
      .slice(0, 50);
  } catch {
    return [];
  }
}

/** Schreibt den Gast-Warenkorb ins Cookie — nur aus Server Actions aufrufbar. */
export async function writeGuestCart(items: GuestCartItem[]): Promise<void> {
  const store = await cookies();
  const cleaned = items.filter((i) => i.quantity > 0).slice(0, 50);
  if (cleaned.length === 0) {
    store.delete(GUEST_CART_COOKIE);
    return;
  }
  store.set(GUEST_CART_COOKIE, JSON.stringify(cleaned), {
    httpOnly: true,
    path: "/",
    maxAge: MAX_AGE,
    sameSite: "lax",
  });
}

/** Löscht den Gast-Warenkorb (nach Merge in den DB-Warenkorb). */
export async function clearGuestCart(): Promise<void> {
  const store = await cookies();
  store.delete(GUEST_CART_COOKIE);
}

/** Anzahl Artikel im Gast-Warenkorb (für das Navbar-Badge). */
export async function guestCartCount(): Promise<number> {
  const items = await readGuestCart();
  return items.reduce((s, i) => s + i.quantity, 0);
}
