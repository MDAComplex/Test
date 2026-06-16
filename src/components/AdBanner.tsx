import { prisma } from "@/lib/prisma";

export default async function AdBanner({ slot }: { slot: string }) {
  const adSlot = await prisma.adSlot.findUnique({ where: { slot } });

  if (!adSlot?.enabled || !adSlot.html) {
    return (
      <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center text-xs text-gray-400 bg-gray-50">
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
