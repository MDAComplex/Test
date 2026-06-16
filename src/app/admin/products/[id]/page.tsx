import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateProduct } from "@/lib/actions";

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
      <form action={updateWithId} className="grid md:grid-cols-2 gap-3 bg-white border rounded-xl p-6">
        <input name="name" defaultValue={product.name} required className="border rounded-lg px-3 py-2" />
        <select name="categoryId" defaultValue={product.categoryId} required className="border rounded-lg px-3 py-2">
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.name}
            </option>
          ))}
        </select>
        <input name="price" type="number" step="0.01" defaultValue={product.price} required className="border rounded-lg px-3 py-2" />
        <input name="image" defaultValue={product.image} className="border rounded-lg px-3 py-2" />
        <input name="shippingMinDays" type="number" defaultValue={product.shippingMinDays} className="border rounded-lg px-3 py-2" />
        <input name="shippingMaxDays" type="number" defaultValue={product.shippingMaxDays} className="border rounded-lg px-3 py-2" />
        <input name="stock" type="number" defaultValue={product.stock} className="border rounded-lg px-3 py-2" />
        <textarea
          name="description"
          defaultValue={product.description}
          className="border rounded-lg px-3 py-2 md:col-span-2"
          rows={3}
        />
        <button className="md:col-span-2 bg-violet-700 text-white py-2 rounded-lg font-semibold hover:bg-violet-800">
          Speichern
        </button>
      </form>
    </div>
  );
}
