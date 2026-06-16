import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex gap-2 mb-6 flex-wrap">
        <Link href="/admin" className="px-3 py-1.5 bg-violet-100 rounded-lg text-sm font-medium">
          📊 Dashboard
        </Link>
        <Link href="/admin/products" className="px-3 py-1.5 bg-violet-100 rounded-lg text-sm font-medium">
          📦 Produkte
        </Link>
        <Link href="/admin/orders" className="px-3 py-1.5 bg-violet-100 rounded-lg text-sm font-medium">
          🧾 Bestellungen
        </Link>
        <Link href="/admin/ads" className="px-3 py-1.5 bg-violet-100 rounded-lg text-sm font-medium">
          📢 Werbung
        </Link>
        <Link href="/" className="px-3 py-1.5 bg-gray-100 rounded-lg text-sm font-medium ml-auto">
          ← Zurück zum Shop
        </Link>
      </div>
      {children}
    </div>
  );
}
