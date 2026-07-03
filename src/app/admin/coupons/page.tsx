import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createCoupon, toggleCoupon, deleteCoupon, applyCategoryDiscount, resetAllDiscounts } from "@/lib/actions";
import { TicketPercent, Trash2, Percent, RotateCcw, Mail } from "lucide-react";

const inputCls = "w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm";
const labelCls = "block text-xs font-medium text-[#6b6b76] mb-1";

export default async function AdminCouponsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const [coupons, categories, discounted] = await Promise.all([
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.product.count({ where: { discountPercent: { gt: 0 } } }),
  ]);

  const now = Date.now();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1c1c1f]">Gutscheine & Rabatte</h1>
        <p className="text-sm text-[#6b6b76]">Gutscheincodes für den Checkout und Rabattaktionen pro Kategorie.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Gutschein-Tabelle */}
        <div className="lg:col-span-2 bg-white border border-[#e5e5e8] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e5e5e8]">
            <h2 className="font-bold flex items-center gap-2 text-[#1c1c1f]">
              <TicketPercent size={18} /> Gutscheine ({coupons.length})
            </h2>
          </div>
          {coupons.length === 0 ? (
            <p className="p-4 text-sm text-[#6b6b76]">Noch keine Gutscheine angelegt.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f7f8] text-left text-[#6b6b76]">
                  <tr>
                    <th className="p-3 font-medium">Code</th>
                    <th className="p-3 font-medium">Rabatt</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Nur für</th>
                    <th className="p-3 font-medium">Gültig bis</th>
                    <th className="p-3 font-medium">Erstellt</th>
                    <th className="p-3 font-medium text-right">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((c) => {
                    const expired = c.expiresAt !== null && c.expiresAt.getTime() < now;
                    return (
                      <tr key={c.id} className="border-t border-[#e5e5e8]">
                        <td className="p-3 font-mono font-semibold text-[#1c1c1f]">{c.code}</td>
                        <td className="p-3">{c.percent}%</td>
                        <td className="p-3">
                          {expired ? (
                            <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600">Abgelaufen</span>
                          ) : c.active ? (
                            <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#1faa59]/10 text-[#1faa59]">Aktiv</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#f4f4f5] text-[#6b6b76]">Inaktiv</span>
                          )}
                        </td>
                        <td className="p-3 text-[#6b6b76]">
                          {c.restrictedToEmail ? (
                            <span className="inline-flex items-center gap-1 text-xs">
                              <Mail size={12} /> {c.restrictedToEmail}
                            </span>
                          ) : (
                            "Alle"
                          )}
                        </td>
                        <td className="p-3 text-[#6b6b76]">
                          {c.expiresAt ? c.expiresAt.toLocaleDateString("de-DE") : "Unbegrenzt"}
                        </td>
                        <td className="p-3 text-[#6b6b76]">{c.createdAt.toLocaleDateString("de-DE")}</td>
                        <td className="p-3">
                          <div className="flex gap-2 justify-end">
                            <form action={async () => { "use server"; await toggleCoupon(c.id); }}>
                              <button className="text-sm text-[#ff5a1f] font-medium hover:underline">
                                {c.active ? "Deaktivieren" : "Aktivieren"}
                              </button>
                            </form>
                            <form action={async () => { "use server"; await deleteCoupon(c.id); }}>
                              <button className="flex items-center gap-1 text-sm text-red-500 hover:underline">
                                <Trash2 size={13} /> Löschen
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Gutschein anlegen */}
          <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
            <h2 className="font-bold mb-3 text-[#1c1c1f]">Neuen Gutschein anlegen</h2>
            <form action={createCoupon} className="space-y-3">
              <div>
                <label className={labelCls}>Code</label>
                <input
                  name="code"
                  required
                  placeholder="z.B. SOMMER20"
                  className={`${inputCls} uppercase`}
                  style={{ textTransform: "uppercase" }}
                  maxLength={32}
                />
              </div>
              <div>
                <label className={labelCls}>Rabatt (%)</label>
                <input name="percent" type="number" min={1} max={90} required className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Gültig bis (optional)</label>
                <input name="expiresAt" type="date" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Nur für E-Mail (optional)</label>
                <input name="restrictedToEmail" type="email" placeholder="kunde@example.com" className={inputCls} />
                <p className="text-xs text-[#6b6b76] mt-1">Wenn gesetzt, gilt der Gutschein nur für den Account mit dieser E-Mail.</p>
              </div>
              <button className="w-full bg-[#ff5a1f] text-white py-2 rounded-xl font-semibold hover:opacity-90 text-sm">
                Gutschein erstellen
              </button>
            </form>
          </div>

          {/* Rabattaktion */}
          <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
            <h2 className="font-bold mb-1 flex items-center gap-2 text-[#1c1c1f]">
              <Percent size={16} /> Rabattaktion
            </h2>
            <p className="text-xs text-[#6b6b76] mb-3">
              Setzt den Produktrabatt für alle Artikel einer Kategorie. Aktuell {discounted} Produkte mit Rabatt.
            </p>
            <form action={applyCategoryDiscount} className="space-y-3">
              <div>
                <label className={labelCls}>Kategorie</label>
                <select name="categoryId" required className={inputCls}>
                  <option value="">Kategorie wählen…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Rabatt (%) — 0 entfernt den Rabatt</label>
                <input name="percent" type="number" min={0} max={90} required defaultValue={10} className={inputCls} />
              </div>
              <button className="w-full bg-[#1c1c1f] text-white py-2 rounded-xl font-semibold hover:opacity-90 text-sm">
                Rabatt anwenden
              </button>
            </form>
            <form action={resetAllDiscounts} className="mt-3">
              <button className="w-full flex items-center justify-center gap-1.5 border border-[#e5e5e8] text-[#6b6b76] py-2 rounded-xl font-medium hover:border-red-300 hover:text-red-600 text-sm">
                <RotateCcw size={14} /> Alle Rabatte zurücksetzen
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
