import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Einfache Prev/Next-Paginierung ("Seite X von Y") für Such- & Kategorieseiten.
export default function Pagination({
  page,
  totalPages,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) search.set(k, v);
    }
    search.set("page", String(p));
    return `${basePath}?${search.toString()}`;
  };

  const btn =
    "flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#e5e5e8] bg-white text-sm font-medium hover:border-[#ff5a1f]";
  const disabled = "opacity-40 pointer-events-none";

  return (
    <div className="flex items-center justify-center gap-3 mt-8">
      <Link href={href(page - 1)} className={`${btn} ${page <= 1 ? disabled : ""}`} aria-disabled={page <= 1}>
        <ChevronLeft size={16} /> Zurück
      </Link>
      <span className="text-sm text-[#6b6b76]">
        Seite {page} von {totalPages}
      </span>
      <Link href={href(page + 1)} className={`${btn} ${page >= totalPages ? disabled : ""}`} aria-disabled={page >= totalPages}>
        Weiter <ChevronRight size={16} />
      </Link>
    </div>
  );
}
