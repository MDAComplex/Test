import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { updateCartQty, removeFromCart } from "@/lib/actions";

export default async function CartPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/cart");

  const items = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true },
    orderBy: { id: "asc" },
  });

  const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Dein Warenkorb</h1>
      {items.length === 0 ? (
        <div>
          <p className="text-gray-500 mb-4">Dein Warenkorb ist leer.</p>
          <Link href="/" className="text-violet-700 underline">
            Weiter shoppen
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 bg-white border rounded-xl p-4">
              <div className="text-4xl">{item.product.image}</div>
              <div className="flex-1">
                <Link href={`/product/${item.productId}`} className="font-semibold">
                  {item.product.name}
                </Link>
                <p className="text-violet-700 font-bold">{item.product.price.toFixed(2)} €</p>
                <p className="text-xs text-gray-500">
                  🚚 {item.product.shippingMinDays}-{item.product.shippingMaxDays} Tage
                </p>
              </div>
              <form action={async (fd) => { "use server"; await updateCartQty(item.id, parseInt(String(fd.get("quantity")), 10)); }} className="flex items-center gap-2">
                <input
                  type="number"
                  name="quantity"
                  defaultValue={item.quantity}
                  min={1}
                  className="w-16 border rounded px-2 py-1"
                />
                <button className="text-sm bg-gray-100 px-3 py-1 rounded">Update</button>
              </form>
              <form action={async () => { "use server"; await removeFromCart(item.id); }}>
                <button className="text-sm text-red-600">Entfernen</button>
              </form>
            </div>
          ))}

          <div className="flex justify-between items-center bg-violet-50 rounded-xl p-4 font-bold text-lg">
            <span>Gesamt</span>
            <span>{total.toFixed(2)} €</span>
          </div>

          <Link
            href="/checkout"
            className="block text-center bg-violet-700 text-white py-3 rounded-lg font-semibold hover:bg-violet-800"
          >
            Zur Kasse
          </Link>
        </div>
      )}
    </div>
  );
}
