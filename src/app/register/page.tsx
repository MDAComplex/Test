import { registerUser } from "@/lib/actions";
import { CATEGORIES } from "@/lib/categories";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import Link from "next/link";

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
      <div className="text-center mb-2">
        <span className="text-2xl font-extrabold">Viralo<span className="text-[#ff5a1f]">.shop</span></span>
      </div>
      <h1 className="text-xl font-bold mb-1 text-center">Konto erstellen</h1>
      <p className="text-sm text-[#6b6b76] text-center mb-6">
        Beantworte ein paar Fragen, damit dein Feed wie ein &quot;Für dich&quot;-Bereich personalisiert wird.
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

        <div>
          <p className="text-sm font-semibold mb-2">Was interessiert dich?</p>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <label key={c.slug} className="flex items-center gap-2 text-sm bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-2 py-1.5 cursor-pointer">
                <input type="checkbox" name="preferences" value={c.slug} />
                {c.emoji} {c.name}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">Welcher Stil bist du?</p>
          <div className="grid grid-cols-2 gap-2">
            {["Minimal & Clean", "Streetwear", "Glam & Beauty", "Tech & Gadgets"].map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-2 py-1.5 cursor-pointer">
                <input type="radio" name="style" value={s} />
                {s}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-2">Wie fühlst du dich beim Shoppen meistens?</p>
          <div className="grid grid-cols-1 gap-2">
            {["Sparsam, ich überlege lange", "Spontan, ich liebe den Kauf-Kick", "Irgendwo dazwischen"].map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-2 py-1.5 cursor-pointer">
                <input type="radio" name="budgetFeel" value={s} />
                {s}
              </label>
            ))}
          </div>
        </div>

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
