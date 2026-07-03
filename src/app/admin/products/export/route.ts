import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Exportiert alle Produkte als JSON-Download (nur für Admins). */
export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const products = await prisma.product.findMany({
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });

  const payload = products.map((p) => ({
    name: p.name,
    description: p.description,
    price: p.price,
    image: p.image,
    images: p.images,
    videoUrl: p.videoUrl,
    discountPercent: p.discountPercent,
    categorySlug: p.category.slug,
    shippingMinDays: p.shippingMinDays,
    shippingMaxDays: p.shippingMaxDays,
    stock: p.stock,
    affiliateUrl: p.affiliateUrl,
    isSample: p.isSample,
  }));

  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="viralo-produkte-${date}.json"`,
    },
  });
}
