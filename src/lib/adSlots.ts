// Relativer Import, damit die Datei auch im Seed-Kontext (prisma/seed.ts) funktioniert.
import { prisma } from "./prisma";

export type AdSlotKind = "banner" | "background";

export type AdSlotDef = {
  slot: string;
  label: string;
  group: string;
  kind: AdSlotKind;
  // Empfohlene Bildgröße (Zielmaße für den Zuschnitt im Admin-Editor).
  recWidth: number;
  recHeight: number;
};

const BANNER = { recWidth: 1200, recHeight: 300 }; // ≈ 4:1
const HERO_BG = { recWidth: 1600, recHeight: 500 }; // ≈ 16:5
const SIDEBAR = { recWidth: 600, recHeight: 600 }; // 1:1

// Zentrales Register aller Werbeplätze im Shop.
// Neue Slots hier eintragen — sie werden automatisch in der DB angelegt
// (siehe ensureAdSlots) und im Admin-Bereich gruppiert angezeigt.
export const AD_SLOTS: AdSlotDef[] = [
  // Startseite
  { slot: "hero-background", label: "Startseite – Hero-Hintergrundbild (Saison)", group: "Startseite", kind: "background", ...HERO_BG },
  { slot: "home-top", label: "Startseite – oben", group: "Startseite", kind: "banner", ...BANNER },
  { slot: "home-mid", label: "Startseite – zwischen den Produktreihen", group: "Startseite", kind: "banner", ...BANNER },
  { slot: "home-feed", label: "Startseite – im Produkt-Feed", group: "Startseite", kind: "banner", ...BANNER },
  { slot: "home-bottom", label: "Startseite – unten vor dem Footer", group: "Startseite", kind: "banner", ...BANNER },
  // Kategorien & Suche
  { slot: "category-top", label: "Kategorieseiten – oben", group: "Kategorien & Suche", kind: "banner", ...BANNER },
  { slot: "search-top", label: "Suchergebnisse – oben", group: "Kategorien & Suche", kind: "banner", ...BANNER },
  // Produkt & Warenkorb
  { slot: "product-bottom", label: "Produktseite – unten", group: "Produkt & Warenkorb", kind: "banner", ...BANNER },
  { slot: "cart-below", label: "Warenkorb – unterhalb", group: "Produkt & Warenkorb", kind: "banner", ...BANNER },
  // Checkout
  { slot: "checkout-sidebar", label: "Checkout – Seitenleiste", group: "Checkout", kind: "banner", ...SIDEBAR },
  // Shopweit
  { slot: "footer-banner", label: "Footer – Banner über dem Footer, shopweit", group: "Shopweit", kind: "banner", ...BANNER },
];

export const AD_SLOT_GROUPS = ["Startseite", "Kategorien & Suche", "Produkt & Warenkorb", "Checkout", "Shopweit"];

export function getAdSlotDef(slot: string): AdSlotDef | undefined {
  return AD_SLOTS.find((s) => s.slot === slot);
}

// Legt alle Registry-Slots in der DB an (falls fehlend) und hält die Labels aktuell.
// Kein manueller Migrationsschritt nötig — wird beim Rendern der Admin-Seite aufgerufen.
export async function ensureAdSlots(): Promise<void> {
  for (const def of AD_SLOTS) {
    await prisma.adSlot.upsert({
      where: { slot: def.slot },
      update: { label: def.label },
      create: { slot: def.slot, label: def.label, enabled: false, html: "" },
    });
  }
}

// Extrahiert eine Bild-URL aus dem html-Feld eines "background"-Slots.
// Neu gespeicherte Background-Slots enthalten nur die nackte URL/Data-URI;
// Legacy-/Hand-HTML wird per src="..."-Regex behandelt.
export function extractImageUrl(html: string): string | null {
  const value = html.trim();
  if (!value) return null;
  if (value.startsWith("<")) {
    const match = value.match(/src\s*=\s*["']([^"']+)["']/i);
    return match ? match[1] : null;
  }
  return value;
}
