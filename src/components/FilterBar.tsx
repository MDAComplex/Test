type Props = {
  action: string;
  query?: string;
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
};

export default function FilterBar({ action, query, sort, minPrice, maxPrice }: Props) {
  return (
    <form action={action} method="GET" className="flex flex-wrap items-end gap-3 mb-6 bg-[#f7f7f8] border border-[#e5e5e8] rounded-xl p-3">
      {query !== undefined && <input type="hidden" name="q" value={query} />}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#6b6b76]">Sortieren</label>
        <select
          name="sort"
          defaultValue={sort || "newest"}
          className="bg-white border border-[#e5e5e8] rounded-lg px-2 py-1.5 text-sm"
        >
          <option value="newest">Neueste</option>
          <option value="price-asc">Preis aufsteigend</option>
          <option value="price-desc">Preis absteigend</option>
          <option value="rating">Beste Bewertung</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#6b6b76]">Preis von</label>
        <input
          type="number"
          name="minPrice"
          defaultValue={minPrice || ""}
          min={0}
          step="0.01"
          placeholder="0"
          className="w-24 bg-white border border-[#e5e5e8] rounded-lg px-2 py-1.5 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[#6b6b76]">Preis bis</label>
        <input
          type="number"
          name="maxPrice"
          defaultValue={maxPrice || ""}
          min={0}
          step="0.01"
          placeholder="999"
          className="w-24 bg-white border border-[#e5e5e8] rounded-lg px-2 py-1.5 text-sm"
        />
      </div>
      <button className="bg-[#ff5a1f] text-white text-sm px-4 py-1.5 rounded-lg font-semibold hover:opacity-90">
        Anwenden
      </button>
    </form>
  );
}
