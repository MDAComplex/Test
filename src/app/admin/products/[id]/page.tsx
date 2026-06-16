import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateProduct } from "@/lib/actions";
import ProductImage from "@/components/ProductImage";

export default async function EditProductPage(props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const { id } = await props.params;
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!product) notFound();

  const updateWithId = async (formData: FormData) => {
    "use server";
    await updateProduct(id, formData);
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Artikel bearbeiten</h1>
      <div className="w-24 h-24 rounded-xl bg-[#22222c] flex items-center justify-center overflow-hidden mb-4">
        <ProductImage image={product.image} className="w-full h-full object-cover flex items-center justify-center text-3xl" />
      </div>
      <form action={updateWithId} className="grid md:grid-cols-2 gap-3 bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-6" encType="multipart/form-data">
        <input name="name" defaultValue={product.name} required className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
        <select name="categoryId" defaultValue={product.categoryId} required className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        <input name="price" type="number" step="0.01" defaultValue={product.price} required className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
        <input name="image" defaultValue={product.image.startsWith("data:") ? "" : product.image} placeholder="Bild-URL oder Emoji" className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
        <label className="md:col-span-2 text-sm text-[#9b9bab]">
          Neues Bild hochladen (ersetzt aktuelles Bild):
          <input name="imageFile" type="file" accept="image/*" className="block w-full mt-1 text-sm" />
        </label>
        <input name="shippingMinDays" type="number" defaultValue={product.shippingMinDays} className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
        <input name="shippingMaxDays" type="number" defaultValue={product.shippingMaxDays} className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
        <input name="stock" type="number" defaultValue={product.stock} className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
        <input name="affiliateUrl" defaultValue={product.affiliateUrl ?? ""} placeholder="Affiliate-/Kauf-URL (optional)" className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
        <textarea
          name="description"
          defaultValue={product.description}
          className="bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2 md:col-span-2"
          rows={3}
        />
        <button className="md:col-span-2 bg-[#ff2d92] text-white py-2 rounded-xl font-semibold hover:opacity-90">
          Speichern
        </button>
      </form>
    </div>
  );
}
