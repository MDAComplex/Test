import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ProductCard from "@/components/ProductCard";
import { getRatingsMap } from "@/lib/reviews";

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
            <ProductCard
              key={w.id}
              id={w.product.id}
              name={w.product.name}
              price={w.product.price}
              image={w.product.image}
              shippingMinDays={w.product.shippingMinDays}
              shippingMaxDays={w.product.shippingMaxDays}
              rating={ratingsMap.get(w.product.id)}
              isWishlisted={true}
            />
          ))}
        </div>
      )}
    </div>
  );
}
