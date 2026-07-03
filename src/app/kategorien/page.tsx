import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ChevronRight } from "lucide-react";

export const metadata = { title: "Alle Kategorien – Viralo.shop" };

export default async function CategoriesPage() {
  // Produktanzahl je Kategorie für die Karten.
  const counts = await prisma.product.groupBy({ by: ["categoryId"], _count: { _all: true } });
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const countBySlug = new Map(
    categories.map((c) => [c.slug, counts.find((x) => x.categoryId === c.id)?._count._all ?? 0])
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Alle Kategorien</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className="flex items-center justify-between bg-white border border-[#e5e5e8] rounded-2xl p-5 hover:border-[#ff5a1f]/60 shadow-sm"
          >
            <div>
              <p className="font-semibold">{c.name}</p>
              <p className="text-xs text-[#6b6b76]">
                {countBySlug.get(c.slug) ?? 0} Artikel
              </p>
            </div>
            <ChevronRight size={18} className="text-[#6b6b76]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
