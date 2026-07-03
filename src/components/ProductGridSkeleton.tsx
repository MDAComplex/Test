/** Animierter Platzhalter im Produktkarten-Layout für loading.tsx-Skeletons. */
export default function ProductGridSkeleton({ count = 10, withHeader = true }: { count?: number; withHeader?: boolean }) {
  return (
    <div className="animate-pulse">
      {withHeader && <div className="h-7 w-48 bg-[#f4f4f5] rounded-xl mb-6" />}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white border border-[#e5e5e8] rounded-2xl p-3 space-y-2">
            <div className="aspect-square bg-[#f4f4f5] rounded-xl" />
            <div className="h-4 bg-[#f4f4f5] rounded w-5/6" />
            <div className="h-4 bg-[#f4f4f5] rounded w-1/2" />
            <div className="h-3 bg-[#f4f4f5] rounded w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
