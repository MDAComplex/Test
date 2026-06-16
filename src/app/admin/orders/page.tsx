import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateOrderStatus } from "@/lib/actions";

const STATUSES = ["PLACED", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED"];
const LABEL: Record<string, string> = {
  PLACED: "Bestellt",
  PACKED: "Verpackt",
  SHIPPED: "Versendet",
  OUT_FOR_DELIVERY: "Wird zugestellt",
  DELIVERED: "Zugestellt",
};

export default async function AdminOrdersPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const orders = await prisma.order.findMany({
    include: { user: true, items: { include: { product: true } } },
    orderBy: { placedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Bestellungen</h1>
      <div className="space-y-4">
        {orders.map((o) => (
          <div key={o.id} className="bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-4">
            <div className="flex justify-between items-start flex-wrap gap-2">
              <div>
                <p className="font-semibold">#{o.id.slice(-6).toUpperCase()} – {o.user.email}</p>
                <p className="text-sm text-[#9b9bab]">
                  {o.items.length} Artikel · {o.total.toFixed(2)} € · {o.placedAt.toLocaleDateString("de-DE")}
                </p>
              </div>
              <form
                action={async (fd) => {
                  "use server";
                  await updateOrderStatus(o.id, String(fd.get("status")));
                }}
                className="flex items-center gap-2"
              >
                <select name="status" defaultValue={o.status} className="bg-[#22222c] border border-[#2c2c38] rounded-lg px-2 py-1 text-sm">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {LABEL[s]}
                    </option>
                  ))}
                </select>
                <button className="text-sm bg-[#ff2d92] text-white px-3 py-1 rounded-lg">Status setzen</button>
              </form>
            </div>
          </div>
        ))}
        {orders.length === 0 && <p className="text-[#6b6b7a]">Noch keine Bestellungen.</p>}
      </div>
    </div>
  );
}
