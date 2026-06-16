import { prisma } from "@/lib/prisma";

export default async function AdBanner({ slot }: { slot: string }) {
  const adSlot = await prisma.adSlot.findUnique({ where: { slot } });

  if (!adSlot?.enabled || !adSlot.html) {
    return (
      <div className="border border-dashed border-[#2c2c38] rounded-xl p-4 text-center text-xs text-[#6b6b7a] bg-[#1a1a22]">
        Werbeplatz ({slot}) — vom Admin im Admin-Panel unter „Werbung“ aktivierbar
      </div>
    );
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      dangerouslySetInnerHTML={{ __html: adSlot.html }}
    />
  );
}
