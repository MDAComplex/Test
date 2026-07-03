import ProductGridSkeleton from "@/components/ProductGridSkeleton";

export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <ProductGridSkeleton count={10} />
    </div>
  );
}
