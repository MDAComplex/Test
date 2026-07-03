import { prisma } from "@/lib/prisma";

// Server-Komponente für Werbeplätze: rendert NICHTS, wenn der Slot deaktiviert
// oder leer ist — keine leeren Boxen, kein Layout-Shift.
export default async function AdSlot({ slot, className }: { slot: string; className?: string }) {
  const adSlot = await prisma.adSlot.findUnique({ where: { slot } });

  if (!adSlot?.enabled || !adSlot.html.trim()) return null;

  return (
    <div className={className}>
      <p className="text-[10px] text-[#6b6b76] mb-1">Anzeige</p>
      <div
        className="ad-slot-html rounded-xl overflow-hidden max-w-full"
        dangerouslySetInnerHTML={{ __html: adSlot.html }}
      />
    </div>
  );
}
