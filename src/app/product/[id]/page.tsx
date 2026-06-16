import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { addToCart, recordProductView } from "@/lib/actions";
import ProductImage from "@/components/ProductImage";
import Link from "next/link";
import { Truck } from "lucide-react";

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
      <Link href={`/category/${product.category.slug}`} className="text-sm text-[#6b6b76] hover:text-[#1c1c1f]">
        ← {product.category.emoji} {product.category.name}
      </Link>
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="aspect-square text-[8rem] flex items-center justify-center bg-white border border-[#e5e5e8] rounded-2xl overflow-hidden">
          <ProductImage image={product.image} className="text-[8rem] w-full h-full object-cover flex items-center justify-center" />
        </div>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-3xl font-extrabold text-[#ff5a1f]">{product.price.toFixed(2)} €</p>
          <p className="text-[#6b6b76]">{product.description}</p>
          <p className="text-sm bg-[#eafbf1] text-[#1faa59] inline-flex items-center gap-1 px-3 py-1 rounded-full">
            <Truck size={14} /> Lieferung in {product.shippingMinDays}-{product.shippingMaxDays} Werktagen
          </p>
          <p className="text-sm text-[#6b6b76]">{product.stock} Stück verfügbar</p>
          <form action={async () => { "use server"; await addToCart(product.id, 1); }}>
            <button className="bg-[#ff5a1f] text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 glow-accent">
              In den Warenkorb
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
