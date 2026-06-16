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
      <h1 className="text-2xl font-bold mb-2 text-center">Konto erstellen</h1>
      <p className="text-sm text-gray-500 text-center mb-6">
        Wähle deine Interessen, damit dein Feed wie ein „Für dich“-Bereich personalisiert wird.
      </p>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2 mb-4">{decodeURIComponent(error)}</p>
      )}
      <form action={register} className="space-y-4 bg-white border rounded-xl p-6">
        <input name="name" placeholder="Name" className="w-full border rounded-lg px-3 py-2" />
        <input name="email" type="email" required placeholder="Email" className="w-full border rounded-lg px-3 py-2" />
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="Passwort (mind. 6 Zeichen)"
          className="w-full border rounded-lg px-3 py-2"
        />

        <div>
          <p className="text-sm font-semibold mb-2">Was interessiert dich?</p>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORIES.map((c) => (
              <label key={c.slug} className="flex items-center gap-2 text-sm border rounded-lg px-2 py-1.5 cursor-pointer">
                <input type="checkbox" name="preferences" value={c.slug} />
                {c.emoji} {c.name}
              </label>
            ))}
          </div>
        </div>

        <button className="w-full bg-violet-700 text-white py-2 rounded-lg font-semibold hover:bg-violet-800">
          Konto erstellen
        </button>
      </form>
      <p className="text-center text-sm text-gray-500 mt-4">
        Schon registriert?{" "}
        <Link href="/login" className="text-violet-700 underline">
          Login
        </Link>
      </p>
    </div>
  );
}
