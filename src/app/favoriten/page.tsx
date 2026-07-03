import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import { getRatingsMap } from "@/lib/reviews";
import { addToCart } from "@/lib/actions";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";

export default async function FavoritenPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/favoriten");

  const wishlist = await prisma.wishlist.findMany({
    where: { userId },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  const ratingsMap = await getRatingsMap(wishlist.map((w) => w.productId));

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Favoriten</h1>
      {wishlist.length === 0 ? (
        <p className="text-[#6b6b76]">Du hast noch keine Produkte zu deinen Favoriten hinzugefügt.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {wishlist.map((w) => (
            <div key={w.id} className="flex flex-col gap-2">
              <ProductCard
                id={w.product.id}
                name={w.product.name}
                price={w.product.price}
                image={w.product.image}
                shippingMinDays={w.product.shippingMinDays}
                shippingMaxDays={w.product.shippingMaxDays}
                discountPercent={w.product.discountPercent}
                stock={w.product.stock}
                rating={ratingsMap.get(w.product.id)}
                isWishlisted={true}
              />
              {w.product.stock <= 0 ? (
                <span className="text-center text-xs text-[#6b6b76] bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl py-2 font-medium">
                  Ausverkauft
                </span>
              ) : w.product.sizes.length > 0 ? (
                <Link
                  href={`/product/${w.product.id}`}
                  className="flex items-center justify-center gap-1.5 bg-white border border-[#e5e5e8] text-[#1c1c1f] py-2 rounded-xl text-xs font-semibold hover:border-[#ff5a1f]"
                >
                  <ShoppingCart size={13} /> Größe wählen
                </Link>
              ) : (
                <form
                  action={async () => {
                    "use server";
                    await addToCart(w.product.id, 1);
                  }}
                >
                  <button className="w-full flex items-center justify-center gap-1.5 bg-[#ff5a1f] text-white py-2 rounded-xl text-xs font-semibold hover:opacity-90">
                    <ShoppingCart size={13} /> In den Warenkorb
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
