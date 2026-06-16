import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createProduct, deleteProduct } from "@/lib/actions";
import Link from "next/link";

export default async function AdminProductsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const [products, categories] = await Promise.all([
    prisma.product.findMany({ include: { category: true }, orderBy: { createdAt: "desc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Produkte verwalten</h1>

      <div className="bg-white border rounded-xl p-6">
        <h2 className="font-bold mb-4">Neuen Artikel anlegen</h2>
        <form action={createProduct} className="grid md:grid-cols-2 gap-3">
          <input name="name" required placeholder="Produktname" className="border rounded-lg px-3 py-2" />
          <select name="categoryId" required className="border rounded-lg px-3 py-2">
            <option value="">Kategorie wählen…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <input name="price" type="number" step="0.01" required placeholder="Preis (€)" className="border rounded-lg px-3 py-2" />
          <input name="image" placeholder="Bild-Emoji oder Bild-URL, z.B. 🎧" className="border rounded-lg px-3 py-2" />
          <input name="shippingMinDays" type="number" defaultValue={2} placeholder="Versand min Tage" className="border rounded-lg px-3 py-2" />
          <input name="shippingMaxDays" type="number" defaultValue={5} placeholder="Versand max Tage" className="border rounded-lg px-3 py-2" />
          <input name="stock" type="number" defaultValue={99} placeholder="Lagerbestand" className="border rounded-lg px-3 py-2" />
          <textarea
            name="description"
            placeholder="Beschreibung"
            className="border rounded-lg px-3 py-2 md:col-span-2"
            rows={2}
          />
          <button className="md:col-span-2 bg-violet-700 text-white py-2 rounded-lg font-semibold hover:bg-violet-800">
            Artikel hinzufügen
          </button>
        </form>
      </div>

      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
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
              <tr key={p.id} className="border-t">
                <td className="p-3">{p.image} {p.name}</td>
                <td className="p-3">{p.category.name}</td>
                <td className="p-3">{p.price.toFixed(2)} €</td>
                <td className="p-3">{p.shippingMinDays}-{p.shippingMaxDays} T.</td>
                <td className="p-3">{p.stock}</td>
                <td className="p-3 flex gap-2">
                  <Link href={`/admin/products/${p.id}`} className="text-violet-700 underline">
                    Bearbeiten
                  </Link>
                  <form action={async () => { "use server"; await deleteProduct(p.id); }}>
                    <button className="text-red-600">Löschen</button>
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
