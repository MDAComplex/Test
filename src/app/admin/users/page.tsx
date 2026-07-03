import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adjustUserCoins, toggleUserBlocked, setUserRole } from "@/lib/actions";
import Link from "next/link";
import { Users, Search, Coins, Ban, ShieldCheck, Shield } from "lucide-react";

export default async function AdminUsersPage(props: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  const me = session?.user as { id?: string; role?: string } | undefined;
  if (me?.role !== "ADMIN") redirect("/");

  const searchParams = await props.searchParams;
  const q = (searchParams.q ?? "").trim();

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { _count: { select: { orders: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1c1c1f] flex items-center gap-2">
          <Users size={22} /> Nutzer
        </h1>
        <p className="text-sm text-[#6b6b76]">
          {users.length} Nutzer {q && `für „${q}"`} — Coins anpassen, blockieren und Rollen verwalten.
        </p>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-3">
        <form method="GET" className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b76]" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Nach E-Mail oder Name suchen…"
              className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <button className="bg-[#1c1c1f] text-white px-3 py-2 rounded-xl text-sm font-medium">Suchen</button>
          {q && (
            <Link href="/admin/users" className="text-sm text-[#6b6b76] underline">
              Zurücksetzen
            </Link>
          )}
        </form>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#f7f7f8] text-left text-[#6b6b76]">
            <tr>
              <th className="p-3 font-medium">Nutzer</th>
              <th className="p-3 font-medium">Rolle</th>
              <th className="p-3 font-medium">Coins</th>
              <th className="p-3 font-medium">Bestellungen</th>
              <th className="p-3 font-medium">Registriert</th>
              <th className="p-3 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === me?.id;
              const isAdmin = u.role === "ADMIN";
              return (
                <tr key={u.id} className="border-t border-[#e5e5e8] align-top">
                  <td className="p-3">
                    <p className="font-medium text-[#1c1c1f]">
                      {u.name || "—"} {isSelf && <span className="text-[10px] text-[#6b6b76] font-normal">(du)</span>}
                    </p>
                    <p className="text-[#6b6b76]">{u.email}</p>
                    {u.blocked && (
                      <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600">
                        <Ban size={11} /> Blockiert
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${
                        isAdmin ? "bg-[#ff5a1f]/10 text-[#ff5a1f]" : "bg-[#f4f4f5] text-[#6b6b76]"
                      }`}
                    >
                      {isAdmin ? <ShieldCheck size={11} /> : <Shield size={11} />} {u.role}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 font-medium text-[#1faa59]">
                      <Coins size={13} /> {u.coins}
                    </span>
                  </td>
                  <td className="p-3">{u._count.orders}</td>
                  <td className="p-3 text-[#6b6b76]">{u.createdAt.toLocaleDateString("de-DE")}</td>
                  <td className="p-3">
                    <div className="flex flex-col items-end gap-2">
                      <form
                        action={async (fd) => {
                          "use server";
                          await adjustUserCoins(u.id, fd);
                        }}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          name="delta"
                          type="number"
                          required
                          placeholder="±Coins"
                          className="w-20 bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-2 py-1 text-xs"
                        />
                        <button className="text-xs bg-[#1faa59] text-white px-2 py-1 rounded-lg font-medium">Coins</button>
                      </form>
                      <div className="flex items-center gap-2">
                        {!(isAdmin && !u.blocked) && !isSelf && (
                          <form action={async () => { "use server"; await toggleUserBlocked(u.id); }}>
                            <button
                              className={`text-xs font-medium hover:underline ${u.blocked ? "text-[#1faa59]" : "text-red-500"}`}
                            >
                              {u.blocked ? "Entsperren" : "Blockieren"}
                            </button>
                          </form>
                        )}
                        {!isSelf && (
                          <form
                            action={async () => {
                              "use server";
                              await setUserRole(u.id, isAdmin ? "USER" : "ADMIN");
                            }}
                          >
                            <button className="text-xs text-[#ff5a1f] font-medium hover:underline">
                              {isAdmin ? "Zu USER machen" : "Zu ADMIN machen"}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-[#6b6b76]">
                  Keine Nutzer gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
