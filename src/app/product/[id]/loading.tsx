export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-pulse">
      <div className="h-4 w-32 bg-[#f4f4f5] rounded mb-4" />
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="space-y-3">
          <div className="aspect-square bg-[#f4f4f5] border border-[#e5e5e8] rounded-2xl" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-16 h-16 bg-[#f4f4f5] rounded-xl" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-7 bg-[#f4f4f5] rounded-xl w-4/5" />
          <div className="h-9 bg-[#f4f4f5] rounded-xl w-1/3" />
          <div className="h-4 bg-[#f4f4f5] rounded w-1/2" />
          <div className="space-y-2">
            <div className="h-3 bg-[#f4f4f5] rounded w-full" />
            <div className="h-3 bg-[#f4f4f5] rounded w-11/12" />
            <div className="h-3 bg-[#f4f4f5] rounded w-2/3" />
          </div>
          <div className="h-7 bg-[#f4f4f5] rounded-full w-48" />
          <div className="flex gap-3">
            <div className="h-12 bg-[#f4f4f5] rounded-lg w-28" />
            <div className="h-12 bg-[#f4f4f5] rounded-lg flex-1" />
          </div>
        </div>
      </div>
      <div className="mt-12 space-y-4">
        <div className="h-6 bg-[#f4f4f5] rounded-xl w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white border border-[#e5e5e8] rounded-xl p-4 space-y-2">
            <div className="h-4 bg-[#f4f4f5] rounded w-1/3" />
            <div className="h-3 bg-[#f4f4f5] rounded w-5/6" />
          </div>
        ))}
      </div>
    </div>
  );
}
