import { resetPassword } from "@/lib/actions";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";

export default async function PasswordResetPage(props: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await props.searchParams;

  async function submit(formData: FormData) {
    "use server";
    try {
      await resetPassword(formData);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      const message = err instanceof Error ? err.message : "Fehler.";
      redirect(
        `/passwort-zuruecksetzen?token=${encodeURIComponent(String(formData.get("token") || ""))}&error=${encodeURIComponent(message)}`
      );
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-12">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2">
          <Logo size={32} />
          <span className="text-2xl font-extrabold">Viralo<span className="text-[#ff5a1f]">.shop</span></span>
        </div>
        <h1 className="text-xl font-bold mt-4">Neues Passwort festlegen</h1>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-2 mb-4">
          {decodeURIComponent(error)}
        </p>
      )}

      {!token ? (
        <p className="text-sm text-[#6b6b76] bg-[#f7f7f8] border border-[#e5e5e8] rounded-2xl p-4">
          Ungültiger Link.{" "}
          <Link href="/passwort-vergessen" className="text-[#ff5a1f] underline">
            Neuen Link anfordern
          </Link>
        </p>
      ) : (
        <form action={submit} className="space-y-4 bg-white border border-[#e5e5e8] rounded-2xl p-6 shadow-sm">
          <input type="hidden" name="token" value={token} />
          <input
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="Neues Passwort (mind. 6 Zeichen)"
            className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]"
          />
          <button className="w-full bg-[#ff5a1f] text-white py-2 rounded-lg font-semibold hover:opacity-90">
            Passwort speichern
          </button>
        </form>
      )}

      <p className="text-center text-sm text-[#6b6b76] mt-4">
        <Link href="/login" className="text-[#ff5a1f] underline">Zurück zum Login</Link>
      </p>
    </div>
  );
}
