import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateAdSlot } from "@/lib/actions";
import { AD_SLOTS, AD_SLOT_GROUPS, ensureAdSlots, extractImageUrl } from "@/lib/adSlots";
import AdImageEditor from "@/components/AdImageEditor";
import { Megaphone, Info, Image as ImageIcon } from "lucide-react";

const inputCls = "w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm";
const labelCls = "block text-xs font-medium text-[#6b6b76] mb-1";

export default async function AdminAdsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  // Neue Registry-Slots automatisch in der DB anlegen (kein Migrationsschritt nötig).
  await ensureAdSlots();

  const dbSlots = await prisma.adSlot.findMany();
  const bySlot = new Map(dbSlots.map((s) => [s.slot, s]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1c1c1f]">Werbung</h1>
        <p className="text-sm text-[#6b6b76]">Werbeplätze im Shop verwalten.</p>
      </div>

      <p className="flex items-start gap-2 text-sm text-[#6b6b76] bg-[#f7f7f8] border border-[#e5e5e8] rounded-xl px-3 py-2">
        <Info size={16} className="shrink-0 mt-0.5" />
        Anzeigen werden im Shop an den Stellen gerendert, an denen die jeweiligen Werbeplätze platziert sind.
        Deaktivierte oder leere Werbeplätze werden im Shop komplett ausgeblendet — keine leeren Boxen.
        Im einfachen Modus wird das Banner-HTML automatisch erzeugt; im erweiterten Modus kannst du rohes HTML
        (z.B. AdSense-Snippets) einfügen.
      </p>

      {AD_SLOT_GROUPS.map((group) => {
        const defs = AD_SLOTS.filter((d) => d.group === group);
        if (defs.length === 0) return null;
        return (
          <section key={group} className="space-y-3">
            <h2 className="text-lg font-bold text-[#1c1c1f]">{group}</h2>
            <div className="grid md:grid-cols-2 gap-4 items-start">
              {defs.map((def) => {
                const slot = bySlot.get(def.slot);
                if (!slot) return null;
                const previewUrl = def.kind === "background" ? extractImageUrl(slot.html) : null;
                return (
                  <div key={slot.id} className="bg-white border border-[#e5e5e8] rounded-2xl p-4 space-y-3">
                    <div className="flex justify-between items-center gap-2">
                      <h3 className="font-bold flex items-center gap-2 text-[#1c1c1f]">
                        {def.kind === "background" ? (
                          <ImageIcon size={16} className="text-[#ff5a1f]" />
                        ) : (
                          <Megaphone size={16} className="text-[#ff5a1f]" />
                        )}
                        {def.label}
                      </h3>
                      <span
                        className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-lg ${
                          slot.enabled ? "bg-[#1faa59]/10 text-[#1faa59]" : "bg-[#f4f4f5] text-[#6b6b76]"
                        }`}
                      >
                        {slot.enabled ? "Aktiv" : "Inaktiv"}
                      </span>
                    </div>

                    <p className="text-xs text-[#6b6b76]">
                      Erscheint im Shop: {def.label}
                      {def.kind === "background" &&
                        " — wird als vollflächiges Hintergrundbild hinter dem Hero-Bereich angezeigt."}
                    </p>

                    {def.kind === "background" ? (
                      <>
                        {previewUrl && (
                          <div>
                            <p className={labelCls}>Vorschau</p>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={previewUrl}
                              alt="Hintergrundbild-Vorschau"
                              className="h-24 w-full object-cover rounded-xl border border-[#e5e5e8]"
                            />
                          </div>
                        )}
                        <form
                          action={async (fd) => {
                            "use server";
                            await updateAdSlot(slot.id, fd);
                          }}
                          encType="multipart/form-data"
                          className="space-y-3"
                        >
                          <input type="hidden" name="mode" value="background" />
                          <AdImageEditor
                            fileInputName="adImageFile"
                            croppedInputName="croppedImage"
                            targetWidth={def.recWidth}
                            targetHeight={def.recHeight}
                            kindLabel="Hero-Hintergrund"
                          />
                          <div>
                            <label className={labelCls}>Oder Bild-URL (optional)</label>
                            <input name="imageUrl" placeholder="https://…" className={inputCls} />
                          </div>
                          <label className="flex items-center gap-2 text-sm text-[#1c1c1f]">
                            <input type="checkbox" name="enabled" defaultChecked={slot.enabled} /> Hintergrundbild aktiv
                          </label>
                          <button className="bg-[#ff5a1f] text-white px-4 py-1.5 rounded-lg text-sm font-semibold hover:opacity-90">
                            Hintergrundbild speichern
                          </button>
                        </form>
                      </>
                    ) : (
                      <>
                        {slot.html.trim() && (
                          <div>
                            <p className={labelCls}>Vorschau</p>
                            <div
                              className="ad-slot-html border border-[#e5e5e8] rounded-xl overflow-hidden p-2 max-h-40 overflow-y-auto text-sm"
                              dangerouslySetInnerHTML={{ __html: slot.html }}
                            />
                          </div>
                        )}

                        {/* Einfacher Modus */}
                        <details className="border border-[#e5e5e8] rounded-xl" open>
                          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-[#1c1c1f] select-none">
                            Einfach (Banner-Generator)
                          </summary>
                          <form
                            action={async (fd) => {
                              "use server";
                              await updateAdSlot(slot.id, fd);
                            }}
                            encType="multipart/form-data"
                            className="p-3 pt-1 space-y-3"
                          >
                            <input type="hidden" name="mode" value="simple" />
                            <AdImageEditor
                              fileInputName="adImageFile"
                              croppedInputName="croppedImage"
                              targetWidth={def.recWidth}
                              targetHeight={def.recHeight}
                              kindLabel={def.slot === "checkout-sidebar" ? "Seitenleiste" : "Banner"}
                            />
                            <div>
                              <label className={labelCls}>Oder Bild-URL (optional)</label>
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
                          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-[#1c1c1f] select-none">
                            HTML (erweitert)
                          </summary>
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
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
