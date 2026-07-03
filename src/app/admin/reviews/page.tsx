import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { deleteReview } from "@/lib/actions";
import Link from "next/link";
import { Star, Search, Trash2, BadgeCheck, MessageSquare } from "lucide-react";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} von 5 Sternen`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={13} className={i <= rating ? "text-[#ff5a1f] fill-[#ff5a1f]" : "text-[#e5e5e8]"} />
      ))}
    </span>
  );
}

export default async function AdminReviewsPage(props: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const searchParams = await props.searchParams;
  const q = (searchParams.q ?? "").trim();

  const reviews = await prisma.review.findMany({
    where: q
      ? {
          OR: [
            { authorName: { contains: q, mode: "insensitive" } },
            { product: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined,
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1c1c1f] flex items-center gap-2">
          <MessageSquare size={22} /> Bewertungen
        </h1>
        <p className="text-sm text-[#6b6b76]">{reviews.length} Bewertungen {q && `für „${q}"`} — moderieren und löschen.</p>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-3">
        <form method="GET" className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6b76]" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Nach Produkt oder Autor suchen…"
              className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl pl-9 pr-3 py-2 text-sm"
            />
          </div>
          <button className="bg-[#1c1c1f] text-white px-3 py-2 rounded-xl text-sm font-medium">Suchen</button>
          {q && (
            <Link href="/admin/reviews" className="text-sm text-[#6b6b76] underline">
              Zurücksetzen
            </Link>
          )}
        </form>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#f7f7f8] text-left text-[#6b6b76]">
            <tr>
              <th className="p-3 font-medium">Produkt</th>
              <th className="p-3 font-medium">Autor</th>
              <th className="p-3 font-medium">Bewertung</th>
              <th className="p-3 font-medium">Text</th>
              <th className="p-3 font-medium">Datum</th>
              <th className="p-3 font-medium text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((r) => (
              <tr key={r.id} className="border-t border-[#e5e5e8] align-top">
                <td className="p-3">
                  <Link href={`/product/${r.productId}`} className="font-medium text-[#1c1c1f] hover:text-[#ff5a1f]">
                    {r.product.name}
                  </Link>
                </td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-1.5 text-[#1c1c1f]">
                    {r.authorName}
                    {r.verified && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg text-[10px] font-semibold bg-[#1faa59]/10 text-[#1faa59]">
                        <BadgeCheck size={11} /> Verifiziert
                      </span>
                    )}
                  </span>
                </td>
                <td className="p-3">
                  <Stars rating={r.rating} />
                </td>
                <td className="p-3 text-[#6b6b76] max-w-xs">
                  {r.text.length > 120 ? `${r.text.slice(0, 120)}…` : r.text}
                </td>
                <td className="p-3 text-[#6b6b76] whitespace-nowrap">{r.createdAt.toLocaleDateString("de-DE")}</td>
                <td className="p-3">
                  <form action={async () => { "use server"; await deleteReview(r.id); }} className="flex justify-end">
                    <button className="flex items-center gap-1 text-red-500 hover:underline">
                      <Trash2 size={13} /> Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {reviews.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-[#6b6b76]">
                  Keine Bewertungen gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
