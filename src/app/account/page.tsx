import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { changeOwnPassword } from "@/lib/actions";
import { isRedirectError } from "next/dist/client/components/redirect-error";

export default async function AccountPage(props: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/account");
  const { error, ok } = await props.searchParams;

  async function submit(formData: FormData) {
    "use server";
    try {
      await changeOwnPassword(formData);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      const message = err instanceof Error ? err.message : "Fehler beim Ändern.";
      redirect(`/account?error=${encodeURIComponent(message)}`);
    }
    redirect("/account?ok=1");
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-12">
      <h1 className="text-xl font-bold mb-6">Passwort ändern</h1>
      {error && (
        <p className="text-sm text-red-300 bg-[#2c1414] border border-[#5a1a1a] rounded-xl p-2 mb-4">{decodeURIComponent(error)}</p>
      )}
      {ok && (
        <p className="text-sm text-[#00f0c0] bg-[#0c2620] border border-[#1a4a3a] rounded-xl p-2 mb-4">Passwort erfolgreich geändert.</p>
      )}
      <form action={submit} className="space-y-4 bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-6">
        <input name="currentPassword" type="password" required placeholder="Aktuelles Passwort" className="w-full bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
        <input name="newPassword" type="password" required minLength={6} placeholder="Neues Passwort (mind. 6 Zeichen)" className="w-full bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
        <button className="w-full bg-[#ff2d92] text-white py-2 rounded-xl font-semibold hover:opacity-90">
          Speichern
        </button>
      </form>
    </div>
  );
}
