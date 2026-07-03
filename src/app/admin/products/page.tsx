import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createProduct, deleteProduct, deleteAllSampleProducts, importProducts } from "@/lib/actions";
import ProductImage from "@/components/ProductImage";
import ProductForm from "./ProductForm";
import Link from "next/link";
import { Trash2, Search, Download, Upload, Plus, Pencil, Star, CheckCircle2 } from "lucide-react";

export default async function AdminProductsPage(props: {
  searchParams: Promise<{ q?: string; imported?: string; skipped?: string; ok?: string }>;
}) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const searchParams = await props.searchParams;
  const q = (searchParams.q ?? "").trim();

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
      include: { category: true, _count: { select: { reviews: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const sampleCount = products.filter((p) => p.isSample).length;
  const imported = searchParams.imported ? parseInt(searchParams.imported, 10) : null;
  const skipped = searchParams.skipped ? parseInt(searchParams.skipped, 10) : 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-[#1c1c1f]">Produkte</h1>
          <p className="text-sm text-[#6b6b76]">{products.length} Produkte {q && `für „${q}"`}</p>
        </div>
        {sampleCount > 0 && (
          <form action={deleteAllSampleProducts}>
            <button className="text-sm bg-red-50 border border-red-300 text-red-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <Trash2 size={14} /> Alle {sampleCount} Beispielartikel löschen
            </button>
          </form>
        )}
      </div>

      {(searchParams.ok === "created" || searchParams.ok === "updated") && (
        <p className="flex items-center gap-2 text-sm text-[#1faa59] bg-[#1faa59]/10 border border-[#1faa59]/30 rounded-xl px-3 py-2">
          <CheckCircle2 size={16} />
          {searchParams.ok === "created" ? "Artikel wurde angelegt." : "Artikel wurde gespeichert."}
        </p>
      )}
      {imported !== null && (
        <p className="flex items-center gap-2 text-sm text-[#1faa59] bg-[#1faa59]/10 border border-[#1faa59]/30 rounded-xl px-3 py-2">
          <CheckCircle2 size={16} />
          {imported} Produkte importiert{skipped > 0 ? `, ${skipped} ungültige Einträge übersprungen` : ""}.
        </p>
      )}

      {/* Werkzeugleiste: Suche, Export, Import */}
      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-3 flex items-center gap-3 flex-wrap">
        <form method="GET" className="flex items-center gap-2 flex-1 min-w-[220px]">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b76]" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Nach Produktname suchen…"
              className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <button className="bg-[#1c1c1f] text-white px-3 py-2 rounded-xl text-sm font-medium">Suchen</button>
          {q && (
            <Link href="/admin/products" className="text-sm text-[#6b6b76] underline">
              Zurücksetzen
            </Link>
          )}
        </form>
        <a
          href="/admin/products/export"
          className="flex items-center gap-1.5 px-3 py-2 bg-[#f7f7f8] border border-[#e5e5e8] rounded-xl text-sm font-medium hover:border-[#ff5a1f]"
        >
          <Download size={15} /> Exportieren (JSON)
        </a>
        <form action={importProducts} encType="multipart/form-data" className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-2 bg-[#f7f7f8] border border-[#e5e5e8] rounded-xl text-sm font-medium cursor-pointer hover:border-[#ff5a1f]">
            <Upload size={15} /> Importieren (JSON)
            <input name="importFile" type="file" accept="application/json,.json" required className="w-36 text-xs" />
          </label>
          <button className="bg-[#ff5a1f] text-white px-3 py-2 rounded-xl text-sm font-medium">Import starten</button>
        </form>
      </div>

      {/* Neues Produkt anlegen (einklappbar) */}
      <details className="bg-white border border-[#e5e5e8] rounded-2xl">
        <summary className="cursor-pointer p-4 font-bold text-[#1c1c1f] flex items-center gap-2 select-none">
          <Plus size={18} className="text-[#ff5a1f]" /> Neuen Artikel anlegen
        </summary>
        <div className="p-4 pt-0">
          <ProductForm action={createProduct} categories={categories} submitLabel="Artikel hinzufügen" />
        </div>
      </details>

      {/* Produktliste */}
      <div className="bg-white border border-[#e5e5e8] rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#f7f7f8] text-left text-[#6b6b76]">
            <tr>
              <th className="p-3 font-medium">Artikel</th>
              <th className="p-3 font-medium">Kategorie</th>
              <th className="p-3 font-medium">Preis</th>
              <th className="p-3 font-medium">Rabatt</th>
              <th className="p-3 font-medium">Lager</th>
              <th className="p-3 font-medium">Bewertungen</th>
              <th className="p-3 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-[#e5e5e8]">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-lg bg-[#f4f4f5] flex items-center justify-center overflow-hidden shrink-0">
                      <ProductImage image={p.image} className="w-full h-full object-cover flex items-center justify-center text-lg" />
                    </span>
                    <span className="font-medium text-[#1c1c1f]">
                      {p.name} {p.isSample && <span className="text-[10px] text-[#6b6b76] font-normal">(Beispiel)</span>}
                    </span>
                  </div>
                </td>
                <td className="p-3 text-[#6b6b76]">{p.category.name}</td>
                <td className="p-3">{p.price.toFixed(2)} €</td>
                <td className="p-3">
                  {p.discountPercent > 0 ? (
                    <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#1faa59]/10 text-[#1faa59]">
                      -{p.discountPercent}%
                    </span>
                  ) : (
                    <span className="text-[#6b6b76]">–</span>
                  )}
                </td>
                <td className="p-3">
                  {p.stock === 0 ? (
                    <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600">Ausverkauft</span>
                  ) : p.stock < 10 ? (
                    <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#ff5a1f]/10 text-[#ff5a1f]">{p.stock} Stk.</span>
                  ) : (
                    <span>{p.stock}</span>
                  )}
                </td>
                <td className="p-3 text-[#6b6b76]">
                  <span className="inline-flex items-center gap-1">
                    <Star size={13} className="text-[#ff5a1f]" /> {p._count.reviews}
                  </span>
                </td>
                <td className="p-3">
                  <div className="flex gap-2 justify-end items-center">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="flex items-center gap-1 text-[#ff5a1f] font-medium hover:underline"
                    >
                      <Pencil size={13} /> Bearbeiten
                    </Link>
                    <form action={async () => { "use server"; await deleteProduct(p.id); }}>
                      <button className="flex items-center gap-1 text-red-500 hover:underline">
                        <Trash2 size={13} /> Löschen
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-[#6b6b76]">
                  Keine Produkte gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
