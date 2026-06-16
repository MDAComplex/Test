import { prisma } from "@/lib/prisma";

export async function getRatingsMap(productIds: string[]) {
  if (productIds.length === 0) return new Map<string, { avg: number; count: number }>();

  const grouped = await prisma.review.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _avg: { rating: true },
    _count: { rating: true },
  });

  const map = new Map<string, { avg: number; count: number }>();
  for (const g of grouped) {
    map.set(g.productId, { avg: g._avg.rating ?? 0, count: g._count.rating });
  }
  return map;
}

export async function getProductRating(productId: string) {
  const result = await prisma.review.aggregate({
    where: { productId },
    _avg: { rating: true },
    _count: { rating: true },
  });
  return { avg: result._avg.rating ?? 0, count: result._count.rating };
}
