import ProductGridSkeleton from "@/components/ProductGridSkeleton";

export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="animate-pulse h-40 bg-[#f4f4f5] border border-[#e5e5e8] rounded-2xl mb-8" />
      <ProductGridSkeleton count={10} />
    </div>
  );
}
