import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createProduct, deleteProduct, deleteAllSampleProducts } from "@/lib/actions";
import ProductImage from "@/components/ProductImage";
import Link from "next/link";

export default async function AdminProductsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const [products, categories] = await Promise.all([
    prisma.product.findMany({ include: { category: true }, orderBy: { createdAt: "desc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const sampleCount = products.filter((p) => p.isSample).length;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Produkte verwalten</h1>
        {sampleCount > 0 && (
          <form action={deleteAllSampleProducts}>
            <button className="text-sm bg-red-900/40 border border-red-700 text-red-300 px-3 py-1.5 rounded-lg">
              🗑️ Alle {sampleCount} Beispielartikel löschen
            </button>
          </form>
        )}
      </div>

      <div className="bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-6">
        <h2 className="font-bold mb-4">Neuen Artikel anlegen</h2>
        <form action={createProduct} className="grid md:grid-cols-2 gap-3" encType="multipart/form-data">
          <input name="name" required placeholder="Produktname" className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
          <select name="categoryId" required className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2">
            <option value="">Kategorie wählen…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <input name="price" type="number" step="0.01" required placeholder="Preis (€)" className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
          <input name="image" placeholder="Bild-URL oder Emoji, z.B. 🎧" className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
          <label className="md:col-span-2 text-sm text-[#9b9bab]">
            Oder Bild hochladen (überschreibt Bild-URL/Emoji):
            <input name="imageFile" type="file" accept="image/*" className="block w-full mt-1 text-sm" />
          </label>
          <input name="shippingMinDays" type="number" defaultValue={2} placeholder="Versand min Tage" className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
          <input name="shippingMaxDays" type="number" defaultValue={5} placeholder="Versand max Tage" className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
          <input name="stock" type="number" defaultValue={99} placeholder="Lagerbestand" className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
          <input name="affiliateUrl" placeholder="Affiliate-/Kauf-URL (optional, später nutzbar)" className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
          <textarea
            name="description"
            placeholder="Beschreibung"
            className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2 md:col-span-2"
            rows={2}
          />
          <button className="md:col-span-2 bg-[#ff2d92] text-white py-2 rounded-xl font-semibold hover:opacity-90">
            Artikel hinzufügen
          </button>
        </form>
      </div>

      <div className="bg-[#1a1a22] border border-[#2c2c38] rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#22222c] text-left">
            <tr>
              <th className="p-3">Artikel</th>
              <th className="p-3">Kategorie</th>
              <th className="p-3">Preis</th>
              <th className="p-3">Versand</th>
              <th className="p-3">Lager</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-[#2c2c38]">
                <td className="p-3 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-[#22222c] flex items-center justify-center overflow-hidden shrink-0">
                    <ProductImage image={p.image} className="w-full h-full object-cover flex items-center justify-center text-lg" />
                  </span>
                  {p.name} {p.isSample && <span className="text-[10px] text-[#6b6b7a]">(Beispiel)</span>}
                </td>
                <td className="p-3">{p.category.name}</td>
                <td className="p-3">{p.price.toFixed(2)} €</td>
                <td className="p-3">{p.shippingMinDays}-{p.shippingMaxDays} T.</td>
                <td className="p-3">{p.stock}</td>
                <td className="p-3 flex gap-2">
                  <Link href={`/admin/products/${p.id}`} className="text-[#00f0c0] underline">
                    Bearbeiten
                  </Link>
                  <form action={async () => { "use server"; await deleteProduct(p.id); }}>
                    <button className="text-red-400">Löschen</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
