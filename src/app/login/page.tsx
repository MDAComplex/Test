import { signIn } from "@/lib/auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { redirect } from "next/navigation";
import Link from "next/link";

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
      <h1 className="text-2xl font-bold mb-6 text-center">Login</h1>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2 mb-4">
          Login fehlgeschlagen. Bitte Email & Passwort prüfen.
        </p>
      )}
      <form action={login} className="space-y-4 bg-white border rounded-xl p-6">
        <input name="email" type="email" required placeholder="Email" className="w-full border rounded-lg px-3 py-2" />
        <input name="password" type="password" required placeholder="Passwort" className="w-full border rounded-lg px-3 py-2" />
        <button className="w-full bg-violet-700 text-white py-2 rounded-lg font-semibold hover:bg-violet-800">
          Einloggen
        </button>
      </form>
      <p className="text-center text-sm text-gray-500 mt-4">
        Noch kein Konto?{" "}
        <Link href="/register" className="text-violet-700 underline">
          Registrieren
        </Link>
      </p>
      <p className="text-center text-xs text-gray-400 mt-6">
        Admin-Demo-Zugang: admin@viralo.shop / Admin123!
      </p>
    </div>
  );
}
