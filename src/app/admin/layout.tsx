import Link from "next/link";
import { LayoutDashboard, Package, Receipt, Megaphone, KeyRound, ArrowLeft } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex gap-2 mb-6 flex-wrap">
        <Link href="/admin" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f7f7f8] border border-[#e5e5e8] rounded-lg text-sm font-medium">
          <LayoutDashboard size={16} /> Dashboard
        </Link>
        <Link href="/admin/products" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f7f7f8] border border-[#e5e5e8] rounded-lg text-sm font-medium">
          <Package size={16} /> Produkte
        </Link>
        <Link href="/admin/orders" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f7f7f8] border border-[#e5e5e8] rounded-lg text-sm font-medium">
          <Receipt size={16} /> Bestellungen
        </Link>
        <Link href="/admin/ads" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f7f7f8] border border-[#e5e5e8] rounded-lg text-sm font-medium">
          <Megaphone size={16} /> Werbung
        </Link>
        <Link href="/account" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f7f7f8] border border-[#e5e5e8] rounded-lg text-sm font-medium">
          <KeyRound size={16} /> Passwort
        </Link>
        <Link href="/" className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f4f4f5] rounded-lg text-sm font-medium ml-auto">
          <ArrowLeft size={16} /> Zurück zum Shop
        </Link>
      </div>
      {children}
    </div>
  );
}
