import { requestPasswordReset } from "@/lib/actions";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import { Info, MailCheck } from "lucide-react";

export default async function PasswordForgotPage(props: {
  searchParams: Promise<{ token?: string; sent?: string; error?: string }>;
}) {
  const { token, sent, error } = await props.searchParams;

  async function submit(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "");
    try {
      const newToken = await requestPasswordReset(email);
      // Demo: kein echter Mail-Versand — Token als Link direkt anzeigen.
      redirect(newToken ? `/passwort-vergessen?token=${encodeURIComponent(newToken)}` : "/passwort-vergessen?sent=1");
    } catch (err) {
      if (isRedirectError(err)) throw err;
      const message = err instanceof Error ? err.message : "Fehler.";
      redirect(`/passwort-vergessen?error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-12">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2">
          <Logo size={32} />
          <span className="text-2xl font-extrabold">Viralo<span className="text-[#ff5a1f]">.shop</span></span>
        </div>
        <h1 className="text-xl font-bold mt-4">Passwort vergessen</h1>
        <p className="text-sm text-[#6b6b76] mt-1">
          Gib deine Email ein, um dein Passwort zurückzusetzen.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-2 mb-4">
          {decodeURIComponent(error)}
        </p>
      )}

      {token ? (
        <div className="bg-[#eafbf1] border border-[#bfe9d1] rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-[#1faa59] flex items-center gap-2">
            <MailCheck size={16} /> Link erstellt
          </p>
          <p className="text-sm text-[#1c1c1f] flex gap-2">
            <Info size={16} className="shrink-0 mt-0.5 text-[#6b6b76]" />
            <span>Demo: E-Mail-Versand wird simuliert – hier ist dein Link (1 Stunde gültig):</span>
          </p>
          <Link
            href={`/passwort-zuruecksetzen?token=${encodeURIComponent(token)}`}
            className="block text-center bg-[#ff5a1f] text-white py-2 rounded-lg font-semibold hover:opacity-90"
          >
            Neues Passwort festlegen
          </Link>
        </div>
      ) : sent ? (
        <p className="text-sm text-[#1c1c1f] bg-[#f7f7f8] border border-[#e5e5e8] rounded-2xl p-4">
          Falls ein Konto mit dieser Email existiert, wurde ein Reset-Link erstellt.
        </p>
      ) : (
        <form action={submit} className="space-y-4 bg-white border border-[#e5e5e8] rounded-2xl p-6 shadow-sm">
          <input
            name="email"
            type="email"
            required
            placeholder="Email"
            className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]"
          />
          <button className="w-full bg-[#ff5a1f] text-white py-2 rounded-lg font-semibold hover:opacity-90">
            Reset-Link anfordern
          </button>
        </form>
      )}

      <p className="text-center text-sm text-[#6b6b76] mt-4">
        <Link href="/login" className="text-[#ff5a1f] underline">Zurück zum Login</Link>
      </p>
    </div>
  );
}
