import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Receipt,
  TicketPercent,
  Megaphone,
  Store,
  Users,
  FolderTree,
  MessageSquare,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/products", label: "Produkte", icon: Package },
  { href: "/admin/categories", label: "Kategorien", icon: FolderTree },
  { href: "/admin/orders", label: "Bestellungen", icon: Receipt },
  { href: "/admin/users", label: "Nutzer", icon: Users },
  { href: "/admin/reviews", label: "Bewertungen", icon: MessageSquare },
  { href: "/admin/coupons", label: "Gutscheine", icon: TicketPercent },
  { href: "/admin/ads", label: "Werbung", icon: Megaphone },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Defense in depth: zusätzlich zum Check in jeder Seite.
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6 bg-white border border-[#e5e5e8] rounded-2xl p-3 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-[#1c1c1f] px-2">Admin</span>
        <nav className="flex gap-1.5 flex-wrap">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f7f7f8] border border-[#e5e5e8] rounded-lg text-sm font-medium text-[#1c1c1f] hover:border-[#ff5a1f] hover:text-[#ff5a1f] transition-colors"
            >
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
        <Link
          href="/"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f4f4f5] rounded-lg text-sm font-medium ml-auto text-[#6b6b76] hover:text-[#1c1c1f]"
        >
          <Store size={16} /> Zum Shop
        </Link>
      </div>
      {children}
    </div>
  );
}
