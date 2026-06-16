"use client";

import { useState } from "react";

type Category = { slug: string; name: string; emoji: string };

const STYLES = ["Minimal & Clean", "Streetwear", "Glam & Beauty", "Tech & Gadgets"];
const BUDGET_FEELS = ["Sparsam, ich überlege lange", "Spontan, ich liebe den Kauf-Kick", "Irgendwo dazwischen"];

export default function OnboardingWizard({
  categories,
  action,
}: {
  categories: readonly Category[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [style, setStyle] = useState("");
  const [budgetFeel, setBudgetFeel] = useState("");

  const steps = [
    { title: "Was interessiert dich?", subtitle: "Wähle eine oder mehrere Kategorien." },
    { title: "Welcher Stil bist du?", subtitle: "Damit wir Produkte passend zu dir zeigen." },
    { title: "Wie fühlst du dich beim Shoppen?", subtitle: "Letzte Frage, versprochen." },
  ];

  const totalSteps = steps.length;
  const progress = Math.round(((step + 1) / totalSteps) * 100);

  const canContinue = step === 0 ? preferences.length > 0 : step === 1 ? !!style : !!budgetFeel;

  function toggleCategory(slug: string) {
    setPreferences((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData();
    preferences.forEach((p) => formData.append("preferences", p));
    formData.append("style", style);
    formData.append("budgetFeel", budgetFeel);
    action(formData);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="mb-8">
        <div className="flex justify-between text-xs text-[#6b6b76] mb-2">
          <span>
            Schritt {step + 1} von {totalSteps}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-2 bg-[#f4f4f5] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#ff5a1f] transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <h1 className="text-xl font-bold mb-1">{steps[step].title}</h1>
        <p className="text-sm text-[#6b6b76] mb-6">{steps[step].subtitle}</p>

        {step === 0 && (
          <div className="grid grid-cols-2 gap-2">
            {categories.map((c) => (
              <label
                key={c.slug}
                className={`flex items-center gap-2 text-sm border rounded-xl px-2 py-1.5 cursor-pointer ${
                  preferences.includes(c.slug) ? "bg-[#fdeee8] border-[#ff5a1f]" : "bg-[#f4f4f5] border-[#e5e5e8]"
                }`}
              >
                <input
                  type="checkbox"
                  className="hidden"
                  checked={preferences.includes(c.slug)}
                  onChange={() => toggleCategory(c.slug)}
                />
                {c.emoji} {c.name}
              </label>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="grid grid-cols-2 gap-2">
            {STYLES.map((s) => (
              <label
                key={s}
                className={`flex items-center gap-2 text-sm border rounded-xl px-2 py-1.5 cursor-pointer ${
                  style === s ? "bg-[#fdeee8] border-[#ff5a1f]" : "bg-[#f4f4f5] border-[#e5e5e8]"
                }`}
              >
                <input type="radio" className="hidden" name="style" checked={style === s} onChange={() => setStyle(s)} />
                {s}
              </label>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 gap-2">
            {BUDGET_FEELS.map((s) => (
              <label
                key={s}
                className={`flex items-center gap-2 text-sm border rounded-xl px-2 py-1.5 cursor-pointer ${
                  budgetFeel === s ? "bg-[#fdeee8] border-[#ff5a1f]" : "bg-[#f4f4f5] border-[#e5e5e8]"
                }`}
              >
                <input
                  type="radio"
                  className="hidden"
                  name="budgetFeel"
                  checked={budgetFeel === s}
                  onChange={() => setBudgetFeel(s)}
                />
                {s}
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mt-6">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="text-sm text-[#6b6b76] px-4 py-2 rounded-lg hover:bg-[#f4f4f5]"
            >
              Zurück
            </button>
          ) : (
            <span />
          )}

          {step < totalSteps - 1 ? (
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => setStep((s) => s + 1)}
              className="bg-[#ff5a1f] text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-40"
            >
              Weiter
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canContinue}
              className="bg-[#ff5a1f] text-white px-5 py-2 rounded-lg font-semibold disabled:opacity-40"
            >
              Fertig
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
