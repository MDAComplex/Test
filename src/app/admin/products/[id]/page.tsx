import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateProduct } from "@/lib/actions";
import ProductForm from "../ProductForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/admin/products" className="inline-flex items-center gap-1.5 text-sm text-[#6b6b76] hover:text-[#1c1c1f] mb-2">
          <ArrowLeft size={15} /> Zurück zur Produktliste
        </Link>
        <h1 className="text-2xl font-bold text-[#1c1c1f]">Artikel bearbeiten</h1>
        <p className="text-sm text-[#6b6b76]">{product.name}</p>
      </div>
      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <ProductForm action={updateWithId} categories={categories} product={product} submitLabel="Änderungen speichern" />
      </div>
    </div>
  );
}
