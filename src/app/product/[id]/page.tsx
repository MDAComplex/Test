import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { addToCart } from "@/lib/actions";
import Link from "next/link";

export default async function ProductPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });

  if (!product) notFound();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href={`/category/${product.category.slug}`} className="text-sm text-violet-700">
        ← {product.category.emoji} {product.category.name}
      </Link>
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="text-[10rem] text-center bg-violet-50 rounded-2xl py-12">{product.image}</div>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-3xl font-extrabold text-violet-700">{product.price.toFixed(2)} €</p>
          <p className="text-gray-600">{product.description}</p>
          <p className="text-sm bg-green-50 text-green-700 inline-block px-3 py-1 rounded-full">
            🚚 Lieferung in {product.shippingMinDays}-{product.shippingMaxDays} Werktagen
          </p>
          <p className="text-sm text-gray-500">{product.stock} Stück verfügbar</p>
          <form action={async () => { "use server"; await addToCart(product.id, 1); }}>
            <button className="bg-violet-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-violet-800">
              In den Warenkorb
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
