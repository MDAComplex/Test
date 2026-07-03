"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { ShoppingCart, Check, LoaderCircle } from "lucide-react";

/**
 * Submit-Button für "In den Warenkorb"-Formulare (Server Actions):
 * zeigt beim Absenden einen Spinner und danach kurz ein "Hinzugefügt ✓",
 * damit sichtbar ist, dass der Klick funktioniert hat.
 */
export default function AddToCartButton({
  label = "In den Warenkorb",
  disabled = false,
  disabledLabel = "Ausverkauft",
  className = "",
  iconSize = 16,
}: {
  label?: string;
  disabled?: boolean;
  disabledLabel?: string;
  className?: string;
  iconSize?: number;
}) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (wasPending.current && !pending) {
      setAdded(true);
      const t = setTimeout(() => setAdded(false), 1600);
      return () => clearTimeout(t);
    }
    wasPending.current = pending;
  }, [pending]);

  if (disabled) {
    return (
      <button disabled className={`${className} opacity-50 cursor-not-allowed`}>
        {disabledLabel}
      </button>
    );
  }

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} transition-all duration-200 ${added ? "!bg-[#1faa59] scale-[1.02]" : ""} ${pending ? "opacity-80" : ""}`}
    >
      <span className="inline-flex items-center justify-center gap-1.5">
        {pending ? (
          <LoaderCircle size={iconSize} className="animate-spin" />
        ) : added ? (
          <Check size={iconSize} className="animate-in" />
        ) : (
          <ShoppingCart size={iconSize} />
        )}
        {pending ? "Wird hinzugefügt…" : added ? "Hinzugefügt" : label}
      </span>
    </button>
  );
}
