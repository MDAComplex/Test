import { registerUser } from "@/lib/actions";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";

export default async function RegisterPage(props: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await props.searchParams;

  async function register(formData: FormData) {
    "use server";
    try {
      await registerUser(formData);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      const message = err instanceof Error ? err.message : "Registrierung fehlgeschlagen.";
      redirect(`/register?error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="flex items-center justify-center gap-2 mb-2">
        <Logo size={32} />
        <span className="text-2xl font-extrabold">Viralo<span className="text-[#ff5a1f]">.shop</span></span>
      </div>
      <h1 className="text-xl font-bold mb-1 text-center">Konto erstellen</h1>
      <p className="text-sm text-[#6b6b76] text-center mb-6">
        Nach der Registrierung personalisieren wir deinen Feed mit ein paar kurzen Fragen.
        Startbonus: <span className="text-[#1faa59] font-semibold">25 Coins</span> 🎉
      </p>
      {error && (
        <p className="text-sm text-red-300 bg-[#2c1414] border border-[#5a1a1a] rounded-xl p-2 mb-4">{decodeURIComponent(error)}</p>
      )}
      <form action={register} className="space-y-5 bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <input name="name" placeholder="Name" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]" />
        <input name="email" type="email" required placeholder="Email" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]" />
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="Passwort (mind. 6 Zeichen)"
          className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]"
        />

        <button className="w-full bg-[#ff5a1f] text-white py-2 rounded-lg font-semibold hover:opacity-90 glow-accent">
          Konto erstellen
        </button>
      </form>
      <p className="text-center text-sm text-[#6b6b76] mt-4">
        Schon registriert?{" "}
        <Link href="/login" className="text-[#ff5a1f] underline">
          Login
        </Link>
      </p>
    </div>
  );
}
