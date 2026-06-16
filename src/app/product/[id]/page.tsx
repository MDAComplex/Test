import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { addToCart, recordProductView } from "@/lib/actions";
import ProductImage from "@/components/ProductImage";
import Link from "next/link";

export default async function ProductPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });

  if (!product) notFound();

  await recordProductView();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href={`/category/${product.category.slug}`} className="text-sm text-[#9b9bab] hover:text-[#f4f4f8]">
        ← {product.category.emoji} {product.category.name}
      </Link>
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="aspect-square text-[8rem] flex items-center justify-center bg-[#1a1a22] border border-[#2c2c38] rounded-2xl overflow-hidden">
          <ProductImage image={product.image} className="text-[8rem] w-full h-full object-cover flex items-center justify-center" />
        </div>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-3xl font-extrabold text-[#ff2d92]">{product.price.toFixed(2)} €</p>
          <p className="text-[#9b9bab]">{product.description}</p>
          <p className="text-sm bg-[#0c2620] text-[#00f0c0] inline-block px-3 py-1 rounded-full">
            🚚 Lieferung in {product.shippingMinDays}-{product.shippingMaxDays} Werktagen
          </p>
          <p className="text-sm text-[#6b6b7a]">{product.stock} Stück verfügbar</p>
          <form action={async () => { "use server"; await addToCart(product.id, 1); }}>
            <button className="bg-[#ff2d92] text-white px-6 py-3 rounded-xl font-semibold hover:opacity-90 glow-accent">
              In den Warenkorb
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
