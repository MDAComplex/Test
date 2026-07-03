import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createCategory, renameCategory, deleteCategory } from "@/lib/actions";
import { FolderTree, Trash2, Plus, Info } from "lucide-react";

const inputCls = "w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm";
const labelCls = "block text-xs font-medium text-[#6b6b76] mb-1";

export default async function AdminCategoriesPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const categories = await prisma.category.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1c1c1f] flex items-center gap-2">
          <FolderTree size={22} /> Kategorien
        </h1>
        <p className="text-sm text-[#6b6b76]">{categories.length} Kategorien — anlegen, umbenennen und (wenn leer) löschen.</p>
      </div>

      <p className="flex items-start gap-2 text-xs text-[#6b6b76] bg-[#f7f7f8] border border-[#e5e5e8] rounded-xl px-3 py-2">
        <Info size={14} className="shrink-0 mt-0.5" />
        Hinweis: Die Kategorieleiste in der Shop-Navigation basiert auf einer festen Liste. Neue Kategorien erscheinen
        in Produktformular, Filtern und auf Kategorieseiten, aber nicht automatisch in der Navbar.
      </p>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 bg-white border border-[#e5e5e8] rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#f7f7f8] text-left text-[#6b6b76]">
              <tr>
                <th className="p-3 font-medium">Kategorie</th>
                <th className="p-3 font-medium">Slug</th>
                <th className="p-3 font-medium">Produkte</th>
                <th className="p-3 font-medium text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-t border-[#e5e5e8]">
                  <td className="p-3">
                    <form
                      action={async (fd) => {
                        "use server";
                        await renameCategory(c.id, fd);
                      }}
                      className="flex items-center gap-2"
                    >
                      <span className="text-lg">{c.emoji}</span>
                      <input
                        name="name"
                        defaultValue={c.name}
                        required
                        className="bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-2 py-1 text-sm font-medium text-[#1c1c1f] w-44"
                      />
                      <button className="text-xs text-[#ff5a1f] font-medium hover:underline">Umbenennen</button>
                    </form>
                  </td>
                  <td className="p-3 font-mono text-xs text-[#6b6b76]">{c.slug}</td>
                  <td className="p-3">{c._count.products}</td>
                  <td className="p-3">
                    <div className="flex justify-end">
                      {c._count.products === 0 ? (
                        <form action={async () => { "use server"; await deleteCategory(c.id); }}>
                          <button className="flex items-center gap-1 text-sm text-red-500 hover:underline">
                            <Trash2 size={13} /> Löschen
                          </button>
                        </form>
                      ) : (
                        <span
                          className="flex items-center gap-1 text-sm text-[#6b6b76]/60 cursor-not-allowed"
                          title="Nur leere Kategorien können gelöscht werden."
                        >
                          <Trash2 size={13} /> Löschen
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-[#6b6b76]">
                    Noch keine Kategorien.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
          <h2 className="font-bold mb-3 flex items-center gap-2 text-[#1c1c1f]">
            <Plus size={16} className="text-[#ff5a1f]" /> Neue Kategorie
          </h2>
          <form action={createCategory} className="space-y-3">
            <div>
              <label className={labelCls}>Name</label>
              <input name="name" required placeholder="z.B. Gartenbedarf" className={inputCls} />
              <p className="text-xs text-[#6b6b76] mt-1">Der Slug wird automatisch aus dem Namen erzeugt.</p>
            </div>
            <div>
              <label className={labelCls}>Emoji (optional)</label>
              <input name="emoji" maxLength={4} placeholder="z.B. Symbol" className={inputCls} />
            </div>
            <button className="w-full bg-[#ff5a1f] text-white py-2 rounded-xl font-semibold hover:opacity-90 text-sm">
              Kategorie anlegen
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
