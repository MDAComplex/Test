import { prisma } from "@/lib/prisma";
import ProductCard from "@/components/ProductCard";
import { notFound } from "next/navigation";

export default async function CategoryPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;

  const category = await prisma.category.findUnique({
    where: { slug },
    include: { products: { orderBy: { createdAt: "desc" } } },
  });

  if (!category) notFound();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">
        {category.emoji} {category.name}
      </h1>
      {category.products.length === 0 ? (
        <p className="text-[#6b6b7a]">Noch keine Artikel in dieser Kategorie.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {category.products.map((p) => (
            <ProductCard
              key={p.id}
              id={p.id}
              name={p.name}
              price={p.price}
              image={p.image}
              shippingMinDays={p.shippingMinDays}
              shippingMaxDays={p.shippingMaxDays}
            />
          ))}
        </div>
      )}
    </div>
  );
}
