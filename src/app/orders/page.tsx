import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

const STATUS_LABEL: Record<string, string> = {
  PLACED: "Bestellt",
  PACKED: "Verpackt",
  SHIPPED: "Versendet",
  OUT_FOR_DELIVERY: "Wird zugestellt",
  DELIVERED: "Zugestellt",
};

export default async function OrdersPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/orders");

  const orders = await prisma.order.findMany({
    where: { userId },
    include: { items: { include: { product: true } } },
    orderBy: { placedAt: "desc" },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Meine Bestellungen</h1>
      {orders.length === 0 ? (
        <p className="text-gray-500">Noch keine Bestellungen.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="block bg-white border rounded-xl p-4 hover:shadow"
            >
              <div className="flex justify-between">
                <span className="font-semibold">Bestellung #{o.id.slice(-6).toUpperCase()}</span>
                <span className="text-sm bg-violet-100 text-violet-700 px-2 py-1 rounded-full">
                  {STATUS_LABEL[o.status]}
                </span>
              </div>
              <p className="text-sm text-gray-500">{o.items.length} Artikel · {o.total.toFixed(2)} €</p>
              <p className="text-xs text-gray-400">
                Aufgegeben am {o.placedAt.toLocaleDateString("de-DE")}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
