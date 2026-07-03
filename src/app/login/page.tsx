import { loginUser } from "@/lib/actions";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";

export default async function LoginPage(props: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; reset?: string }>;
}) {
  const { callbackUrl, error, reset } = await props.searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      // loginUser merged vor dem signIn den Gast-Warenkorb in den Account.
      await loginUser(formData, callbackUrl);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      redirect(`/login?error=1${callbackUrl ? `&callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`);
    }
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-12">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-2">
          <Logo size={32} />
          <span className="text-2xl font-extrabold">Viralo<span className="text-[#ff5a1f]">.shop</span></span>
        </div>
        <p className="text-[#6b6b76] text-sm mt-1">Shoppe ohne Reue</p>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-2 mb-4">
          Login fehlgeschlagen. Bitte Email &amp; Passwort prüfen.
        </p>
      )}
      {reset === "ok" && (
        <p className="text-sm text-[#1faa59] bg-[#eafbf1] border border-[#bfe9d1] rounded-xl p-2 mb-4">
          Passwort erfolgreich zurückgesetzt. Du kannst dich jetzt anmelden.
        </p>
      )}
      <form action={login} className="space-y-4 bg-white border border-[#e5e5e8] rounded-2xl p-6 shadow-sm">
        <input name="email" type="email" required placeholder="Email" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]" />
        <input name="password" type="password" required placeholder="Passwort" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]" />
        <button className="w-full bg-[#ff5a1f] text-white py-2 rounded-lg font-semibold hover:opacity-90 glow-accent">
          Einloggen
        </button>
        <p className="text-right text-xs">
          <Link href="/passwort-vergessen" className="text-[#6b6b76] hover:text-[#ff5a1f] underline">
            Passwort vergessen?
          </Link>
        </p>
      </form>
      <p className="text-center text-sm text-[#6b6b76] mt-4">
        Noch kein Konto?{" "}
        <Link href="/register" className="text-[#ff5a1f] underline">
          Registrieren
        </Link>
      </p>
      <p className="text-center text-xs text-[#6b6b76] mt-6">
        Admin-Demo-Zugang: admin@viralo.shop / Admin123!
      </p>
    </div>
  );
}
