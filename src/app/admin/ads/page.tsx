import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateAdSlot } from "@/lib/actions";

export default async function AdminAdsPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const slots = await prisma.adSlot.findMany();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Werbung verwalten</h1>
      <p className="text-sm text-gray-500">
        Füge hier den Anzeigencode deines Werbenetzwerks (z.B. Google AdSense, TikTok Pixel/Ads Snippet)
        ein und aktiviere den jeweiligen Platz. Damit kannst du echte Werbeeinnahmen erzielen, sobald
        echte Besucher auf die Seite kommen.
      </p>
      <div className="space-y-4">
        {slots.map((slot) => (
          <form
            key={slot.id}
            action={async (fd) => {
              "use server";
              await updateAdSlot(slot.id, fd);
            }}
            className="bg-white border rounded-xl p-4 space-y-3"
          >
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">{slot.label || slot.slot}</h2>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="enabled" defaultChecked={slot.enabled} />
                Aktiv
              </label>
            </div>
            <textarea
              name="html"
              defaultValue={slot.html}
              placeholder="<script>...Anzeigencode hier einfügen...</script>"
              className="w-full border rounded-lg px-3 py-2 font-mono text-xs"
              rows={4}
            />
            <button className="bg-violet-700 text-white px-4 py-1.5 rounded-lg text-sm">Speichern</button>
          </form>
        ))}
      </div>
    </div>
  );
}
