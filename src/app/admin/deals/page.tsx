import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createDeal, toggleDeal, deleteDeal } from "@/lib/actions";
import ProductImage from "@/components/ProductImage";
import { Zap, Plus, Trash2, Power } from "lucide-react";

function formatDate(d: Date) {
  return `${d.toLocaleDateString("de-DE")}, ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

/** Status eines Deals: live / geplant / abgelaufen / inaktiv (bzw. ausverkauft = abgelaufen). */
function dealStatus(deal: { active: boolean; startsAt: Date; endsAt: Date; sold: number; quantity: number }, now: Date) {
  if (!deal.active) return { label: "Inaktiv", cls: "bg-[#f4f4f5] text-[#6b6b76]" };
  if (deal.endsAt < now || deal.sold >= deal.quantity) return { label: "Abgelaufen", cls: "bg-red-50 text-red-600" };
  if (deal.startsAt > now) return { label: "Geplant", cls: "bg-[#ff5a1f]/10 text-[#ff5a1f]" };
  return { label: "Live", cls: "bg-[#1faa59]/10 text-[#1faa59]" };
}

export default async function AdminDealsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const [deals, products] = await Promise.all([
    prisma.deal.findMany({ include: { product: true }, orderBy: { endsAt: "desc" } }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
  ]);
  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1c1c1f] flex items-center gap-2">
          <Zap size={22} className="text-[#ff5a1f]" /> Blitzangebote
        </h1>
        <p className="text-sm text-[#6b6b76]">
          {deals.length} Deals. Ein Deal ist live, wenn er aktiv ist, im Zeitfenster liegt und das Kontingent noch nicht erschöpft ist.
        </p>
      </div>

      {/* Neuen Deal anlegen */}
      <details className="bg-white border border-[#e5e5e8] rounded-2xl">
        <summary className="cursor-pointer p-4 font-bold text-[#1c1c1f] flex items-center gap-2 select-none">
          <Plus size={18} className="text-[#ff5a1f]" /> Neuen Deal anlegen
        </summary>
        <form action={createDeal} className="p-4 pt-0 grid sm:grid-cols-2 gap-3">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-[#1c1c1f]">Produkt</span>
            <select name="productId" required className="mt-1 w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm">
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.price.toFixed(2)} €)
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#1c1c1f]">Rabatt (%)</span>
            <input
              name="percent"
              type="number"
              min={5}
              max={90}
              defaultValue={20}
              required
              className="mt-1 w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm"
            />
            <span className="text-xs text-[#6b6b76]">5–90%</span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#1c1c1f]">Kontingent (Stück)</span>
            <input
              name="quantity"
              type="number"
              min={1}
              defaultValue={10}
              required
              className="mt-1 w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#1c1c1f]">Start</span>
            <input
              name="startsAt"
              type="datetime-local"
              required
              className="mt-1 w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#1c1c1f]">Ende</span>
            <input
              name="endsAt"
              type="datetime-local"
              required
              className="mt-1 w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm"
            />
          </label>
          <div className="sm:col-span-2">
            <button className="bg-[#ff5a1f] text-white px-4 py-2 rounded-xl text-sm font-medium">Deal anlegen</button>
          </div>
        </form>
      </details>

      {/* Deal-Liste */}
      <div className="bg-white border border-[#e5e5e8] rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#f7f7f8] text-left text-[#6b6b76]">
            <tr>
              <th className="p-3 font-medium">Produkt</th>
              <th className="p-3 font-medium">Rabatt</th>
              <th className="p-3 font-medium">Verkauft</th>
              <th className="p-3 font-medium">Start</th>
              <th className="p-3 font-medium">Ende</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => {
              const status = dealStatus(d, now);
              return (
                <tr key={d.id} className="border-t border-[#e5e5e8]">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="w-9 h-9 rounded-lg bg-[#f4f4f5] flex items-center justify-center overflow-hidden shrink-0">
                        <ProductImage image={d.product.image} className="w-full h-full object-cover flex items-center justify-center text-lg" />
                      </span>
                      <span className="font-medium text-[#1c1c1f]">{d.product.name}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#1faa59]/10 text-[#1faa59]">
                      -{d.percent}%
                    </span>
                  </td>
                  <td className="p-3 tabular-nums">
                    {d.sold}/{d.quantity}
                  </td>
                  <td className="p-3 text-[#6b6b76] whitespace-nowrap">{formatDate(d.startsAt)}</td>
                  <td className="p-3 text-[#6b6b76] whitespace-nowrap">{formatDate(d.endsAt)}</td>
                  <td className="p-3">
                    <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-semibold ${status.cls}`}>{status.label}</span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-3 justify-end items-center">
                      <form action={async () => { "use server"; await toggleDeal(d.id); }}>
                        <button className="flex items-center gap-1 text-[#ff5a1f] font-medium hover:underline">
                          <Power size={13} /> {d.active ? "Deaktivieren" : "Aktivieren"}
                        </button>
                      </form>
                      <form action={async () => { "use server"; await deleteDeal(d.id); }}>
                        <button className="flex items-center gap-1 text-red-500 hover:underline">
                          <Trash2 size={13} /> Löschen
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {deals.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-[#6b6b76]">
                  Noch keine Deals angelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
