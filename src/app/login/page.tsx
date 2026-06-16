import { signIn } from "@/lib/auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";

export default async function LoginPage(props: { searchParams: Promise<{ callbackUrl?: string; error?: string }> }) {
  const { callbackUrl, error } = await props.searchParams;

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: callbackUrl || "/",
      });
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
        <p className="text-[#6b6b76] text-sm mt-1">Shoppe ohne Reue 🎮</p>
      </div>
      {error && (
        <p className="text-sm text-red-300 bg-[#2c1414] border border-[#5a1a1a] rounded-xl p-2 mb-4">
          Login fehlgeschlagen. Bitte Email & Passwort prüfen.
        </p>
      )}
      <form action={login} className="space-y-4 bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <input name="email" type="email" required placeholder="Email" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]" />
        <input name="password" type="password" required placeholder="Passwort" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]" />
        <button className="w-full bg-[#ff5a1f] text-white py-2 rounded-lg font-semibold hover:opacity-90 glow-accent">
          Einloggen
        </button>
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
