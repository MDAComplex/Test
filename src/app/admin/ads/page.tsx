import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateAdSlot } from "@/lib/actions";
import { Megaphone, Info } from "lucide-react";

const inputCls = "w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm";
const labelCls = "block text-xs font-medium text-[#6b6b76] mb-1";

export default async function AdminAdsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const slots = await prisma.adSlot.findMany();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1c1c1f]">Werbung</h1>
        <p className="text-sm text-[#6b6b76]">Werbeplätze im Shop verwalten.</p>
      </div>

      <p className="flex items-start gap-2 text-sm text-[#6b6b76] bg-[#f7f7f8] border border-[#e5e5e8] rounded-xl px-3 py-2">
        <Info size={16} className="shrink-0 mt-0.5" />
        Anzeigen werden im Shop an den Stellen gerendert, an denen die jeweiligen Werbeplätze platziert sind.
        Im einfachen Modus wird das Banner-HTML automatisch erzeugt; im erweiterten Modus kannst du rohes HTML
        (z.B. AdSense-Snippets) einfügen.
      </p>

      <div className="grid md:grid-cols-2 gap-4 items-start">
        {slots.map((slot) => (
          <div key={slot.id} className="bg-white border border-[#e5e5e8] rounded-2xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="font-bold flex items-center gap-2 text-[#1c1c1f]">
                <Megaphone size={16} className="text-[#ff5a1f]" /> {slot.label || slot.slot}
              </h2>
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${
                  slot.enabled ? "bg-[#1faa59]/10 text-[#1faa59]" : "bg-[#f4f4f5] text-[#6b6b76]"
                }`}
              >
                {slot.enabled ? "Aktiv" : "Inaktiv"}
              </span>
            </div>

            {/* Einfacher Modus */}
            <details className="border border-[#e5e5e8] rounded-xl" open>
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-[#1c1c1f] select-none">Einfach (Banner-Generator)</summary>
              <form
                action={async (fd) => {
                  "use server";
                  await updateAdSlot(slot.id, fd);
                }}
                encType="multipart/form-data"
                className="p-3 pt-1 space-y-3"
              >
                <input type="hidden" name="mode" value="simple" />
                <div>
                  <label className={labelCls}>Bild hochladen</label>
                  <input name="adImageFile" type="file" accept="image/*" className="block w-full text-sm" />
                </div>
                <div>
                  <label className={labelCls}>Oder Bild-URL</label>
                  <input name="imageUrl" placeholder="https://…" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Ziel-Link</label>
                  <input name="targetUrl" placeholder="https://…" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Titeltext</label>
                  <input name="title" placeholder="z.B. Jetzt 20% sparen" className={inputCls} />
                </div>
                <label className="flex items-center gap-2 text-sm text-[#1c1c1f]">
                  <input type="checkbox" name="enabled" defaultChecked={slot.enabled} /> Werbeplatz aktiv
                </label>
                <button className="bg-[#ff5a1f] text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:opacity-90">
                  Banner generieren & speichern
                </button>
              </form>
            </details>

            {/* HTML-Modus */}
            <details className="border border-[#e5e5e8] rounded-xl">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-[#1c1c1f] select-none">HTML (erweitert)</summary>
              <form
                action={async (fd) => {
                  "use server";
                  await updateAdSlot(slot.id, fd);
                }}
                className="p-3 pt-1 space-y-3"
              >
                <input type="hidden" name="mode" value="html" />
                <textarea
                  name="html"
                  defaultValue={slot.html}
                  placeholder="<script>…Anzeigencode hier einfügen…</script>"
                  className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2 font-mono text-xs"
                  rows={5}
                />
                <label className="flex items-center gap-2 text-sm text-[#1c1c1f]">
                  <input type="checkbox" name="enabled" defaultChecked={slot.enabled} /> Werbeplatz aktiv
                </label>
                <button className="bg-[#1c1c1f] text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:opacity-90">
                  HTML speichern
                </button>
              </form>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
