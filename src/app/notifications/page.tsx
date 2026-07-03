import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { grantDeliveryRewards } from "@/lib/rewards";
import { Bell, Truck, PackageCheck, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/notifications");

  // Lazy-Check: neue Versand-/Zustellbenachrichtigungen erzeugen, bevor gelistet wird.
  await grantDeliveryRewards(userId);

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Beim Ansehen alle als gelesen markieren (der ungelesen-Zustand wird oben noch angezeigt).
  await prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Bell size={22} className="text-[#ff5a1f]" /> Benachrichtigungen
      </h1>

      {notifications.length === 0 ? (
        <p className="text-[#6b6b76]">Noch keine Benachrichtigungen.</p>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const Icon = n.title.includes("zugestellt") ? PackageCheck : n.title.includes("Versand") ? Truck : Bell;
            return (
              <div
                key={n.id}
                className={`bg-white border rounded-2xl p-4 flex gap-3 ${
                  n.read ? "border-[#e5e5e8]" : "border-[#ff5a1f]/50 bg-[#fff7ed]"
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-[#f4f4f5] flex items-center justify-center shrink-0">
                  <Icon size={17} className={n.title.includes("zugestellt") ? "text-[#1faa59]" : "text-[#ff5a1f]"} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{n.title}</p>
                    {!n.read && <span className="w-2 h-2 rounded-full bg-[#ff5a1f] shrink-0" />}
                  </div>
                  <p className="text-sm text-[#6b6b76] break-words">{n.body}</p>
                  <p className="text-xs text-[#6b6b76] mt-1">
                    {n.createdAt.toLocaleDateString("de-DE")} ·{" "}
                    {n.createdAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-[#6b6b76] mt-8 flex items-center gap-1">
        <Mail size={12} /> Hinweis: In dieser Demo werden E-Mails simuliert und als Benachrichtigung angezeigt.
      </p>
    </div>
  );
}
