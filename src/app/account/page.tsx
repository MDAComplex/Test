import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { changeOwnPassword, updateOwnName, addAddress, deleteAddress, setDefaultAddress } from "@/lib/actions";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getRank } from "@/lib/rewards";
import { COUNTRIES, countryName } from "@/lib/countries";
import Link from "next/link";
import RewardIcon from "@/components/RewardIcon";
import { Package, Flame, Wallet, PiggyBank, Pencil, KeyRound, LogOut, SlidersHorizontal, MapPin, Trash2 } from "lucide-react";

export default async function AccountPage(props: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/account");
  const { error, ok } = await props.searchParams;

  const [user, orders, addresses] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.order.findMany({ where: { userId }, orderBy: { placedAt: "desc" }, take: 5 }),
    prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);
  if (!user) redirect("/login");

  const { current } = getRank(user.coins);

  async function submitPassword(formData: FormData) {
    "use server";
    try {
      await changeOwnPassword(formData);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      const message = err instanceof Error ? err.message : "Fehler beim Ändern.";
      redirect(`/account?error=${encodeURIComponent(message)}`);
    }
    redirect("/account?ok=password");
  }

  async function submitName(formData: FormData) {
    "use server";
    try {
      await updateOwnName(formData);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      const message = err instanceof Error ? err.message : "Fehler beim Ändern.";
      redirect(`/account?error=${encodeURIComponent(message)}`);
    }
    redirect("/account?ok=name");
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{user.name || "Mein Konto"}</h1>
        <p className="text-sm text-[#6b6b76]">{user.email}</p>
      </div>

      {error && (
        <p className="text-sm text-red-300 bg-[#2c1414] border border-[#5a1a1a] rounded-xl p-2">{decodeURIComponent(error)}</p>
      )}
      {ok === "password" && (
        <p className="text-sm text-[#1faa59] bg-[#eafbf1] border border-[#bfe9d1] rounded-xl p-2">Passwort erfolgreich geändert.</p>
      )}
      {ok === "name" && (
        <p className="text-sm text-[#1faa59] bg-[#eafbf1] border border-[#bfe9d1] rounded-xl p-2">Name erfolgreich geändert.</p>
      )}
      {ok === "preferences" && (
        <p className="text-sm text-[#1faa59] bg-[#eafbf1] border border-[#bfe9d1] rounded-xl p-2">Präferenzen gespeichert.</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 text-center">
          <Wallet size={18} className="mx-auto mb-1 text-[#ff5a1f]" />
          <p className="text-lg font-extrabold">{user.coins}</p>
          <p className="text-xs text-[#6b6b76]">Coins</p>
        </div>
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 text-center">
          <RewardIcon iconKey={current.iconKey} size={18} className="mx-auto mb-1 text-[#ff5a1f]" />
          <p className="text-sm font-bold">{current.label}</p>
          <p className="text-xs text-[#6b6b76]">Rang</p>
        </div>
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 text-center">
          <Flame size={18} className="mx-auto mb-1 text-[#ff5a1f]" />
          <p className="text-lg font-extrabold">{user.streak}</p>
          <p className="text-xs text-[#6b6b76]">Tage Streak</p>
        </div>
        <div className="bg-[#eafbf1] border border-[#bfe9d1] rounded-2xl p-4 text-center">
          <PiggyBank size={18} className="mx-auto mb-1 text-[#1faa59]" />
          <p className="text-lg font-extrabold text-[#1faa59]">{user.totalSaved.toFixed(2)} €</p>
          <p className="text-xs text-[#6b6b76]">Gespart</p>
        </div>
      </div>
      <Link href="/rewards" className="text-sm text-[#ff5a1f] font-medium underline">
        Alle Rewards, Badges & Mystery Box ansehen →
      </Link>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Package size={18} /> Meine Bestellungen
        </h2>
        {orders.length === 0 ? (
          <p className="text-sm text-[#6b6b76]">Noch keine Bestellungen.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex justify-between items-center py-1 hover:text-[#ff5a1f]">
                  <span>#{o.id.slice(-6).toUpperCase()}</span>
                  <span className="text-[#6b6b76]">{o.placedAt.toLocaleDateString("de-DE")}</span>
                  <span className="font-semibold">{o.total.toFixed(2)} €</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/orders" className="text-sm text-[#ff5a1f] font-medium underline block mt-3">
          Alle Bestellungen & Tracking ansehen →
        </Link>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <SlidersHorizontal size={18} /> Präferenzen
        </h2>
        <p className="text-sm text-[#6b6b76] mb-3">
          Lege fest, welche Kategorien und Stile dir auf der Startseite zuerst angezeigt werden.
        </p>
        <Link
          href="/onboarding"
          className="inline-block bg-[#f4f4f5] border border-[#e5e5e8] px-4 py-2 rounded-lg text-sm font-semibold hover:border-[#ff5a1f]"
        >
          Präferenzen anpassen
        </Link>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <MapPin size={18} /> Adressen
        </h2>
        {addresses.length === 0 ? (
          <p className="text-sm text-[#6b6b76] mb-4">Noch keine Adressen gespeichert.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {addresses.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 border border-[#e5e5e8] rounded-xl p-3">
                <div className="text-sm">
                  <p className="font-semibold">
                    {a.name}
                    {a.isDefault && (
                      <span className="ml-2 text-[10px] font-bold text-[#1faa59] bg-[#eafbf1] px-1.5 py-0.5 rounded">
                        Standard
                      </span>
                    )}
                  </p>
                  <p className="text-[#6b6b76]">
                    {a.street}, {a.zip} {a.city}, {countryName(a.country)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!a.isDefault && (
                    <form action={async () => { "use server"; await setDefaultAddress(a.id); }}>
                      <button className="text-xs text-[#6b6b76] hover:text-[#ff5a1f] underline">
                        Als Standard
                      </button>
                    </form>
                  )}
                  <form action={async () => { "use server"; await deleteAddress(a.id); }}>
                    <button aria-label="Adresse löschen" className="text-red-400 hover:text-red-500 p-1">
                      <Trash2 size={15} />
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
        <form action={addAddress} className="space-y-3 border-t border-[#e5e5e8] pt-4">
          <p className="text-sm font-semibold">Neue Adresse hinzufügen</p>
          <input name="name" required placeholder="Vollständiger Name" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2 text-sm" />
          <input name="street" required placeholder="Straße und Hausnummer" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-3">
            <input name="zip" required placeholder="PLZ" className="w-1/3 bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2 text-sm" />
            <input name="city" required placeholder="Ort" className="w-2/3 bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2 text-sm" />
          </div>
          <select name="country" defaultValue="CH" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2 text-sm">
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          <button className="bg-[#ff5a1f] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
            Adresse speichern
          </button>
        </form>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <Pencil size={18} /> Name ändern
        </h2>
        <form action={submitName} className="flex gap-2">
          <input
            name="name"
            defaultValue={user.name ?? ""}
            required
            placeholder="Name"
            className="flex-1 bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2"
          />
          <button className="bg-[#ff5a1f] text-white px-4 py-2 rounded-lg font-semibold hover:opacity-90">
            Speichern
          </button>
        </form>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3 flex items-center gap-2">
          <KeyRound size={18} /> Passwort ändern
        </h2>
        <form action={submitPassword} className="space-y-3">
          <input name="currentPassword" type="password" required placeholder="Aktuelles Passwort" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2" />
          <input name="newPassword" type="password" required minLength={6} placeholder="Neues Passwort (mind. 6 Zeichen)" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2" />
          <button className="w-full bg-[#ff5a1f] text-white py-2 rounded-lg font-semibold hover:opacity-90">
            Passwort speichern
          </button>
        </form>
      </div>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button className="w-full flex items-center justify-center gap-2 bg-[#f4f4f5] border border-[#e5e5e8] py-2 rounded-lg font-medium text-sm">
          <LogOut size={16} /> Logout
        </button>
      </form>
    </div>
  );
}
