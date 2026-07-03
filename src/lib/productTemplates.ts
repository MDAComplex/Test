// Produkt-Vorlagen für das Admin-Anlegeformular: füllen typische Werte
// (Lager, Versandfenster, Rabatt, Kategorie) und ein Beschreibungs-Gerüst vor.

export type ProductTemplate = {
  key: string;
  label: string;
  description: string;
  stock: number;
  shippingMinDays: number;
  shippingMaxDays: number;
  discountPercent: number;
  categorySlug: string;
};

export const TEMPLATES: ProductTemplate[] = [
  {
    key: "elektronik",
    label: "Elektronik",
    description:
      "___ – das smarte Gadget für deinen Alltag.\n\nHighlights:\n- Hochwertige Verarbeitung und moderne Technik\n- Einfache Einrichtung in wenigen Minuten\n- Lange Akkulaufzeit\n\nLieferumfang: ___, Ladekabel, Kurzanleitung.",
    stock: 50,
    shippingMinDays: 2,
    shippingMaxDays: 5,
    discountPercent: 10,
    categorySlug: "elektronik",
  },
  {
    key: "kleidung",
    label: "Kleidung / Mode",
    description:
      "___ – dein neues Lieblingsteil.\n\nDetails:\n- Angenehmer, hautfreundlicher Stoff\n- Moderner Schnitt, in mehreren Größen erhältlich\n- Pflegeleicht und formstabil\n\nMaterial: ___. Pflegehinweis: Maschinenwäsche bei 30 °C.",
    stock: 120,
    shippingMinDays: 2,
    shippingMaxDays: 4,
    discountPercent: 15,
    categorySlug: "mode",
  },
  {
    key: "beauty",
    label: "Beauty",
    description:
      "___ – Pflege, die man sieht und spürt.\n\nWirkung:\n- Spendet intensive Feuchtigkeit\n- Für alle Hauttypen geeignet\n- Dermatologisch getestet\n\nAnwendung: ___ morgens und abends auf die gereinigte Haut auftragen.",
    stock: 200,
    shippingMinDays: 1,
    shippingMaxDays: 3,
    discountPercent: 20,
    categorySlug: "beauty",
  },
  {
    key: "haushalt",
    label: "Haushalt",
    description:
      "___ – macht den Haushalt spürbar leichter.\n\nVorteile:\n- Robust und langlebig\n- Platzsparend zu verstauen\n- Einfache Reinigung\n\nMaße: ___. Material: hochwertiger Kunststoff/Edelstahl.",
    stock: 80,
    shippingMinDays: 3,
    shippingMaxDays: 6,
    discountPercent: 10,
    categorySlug: "haushalt",
  },
  {
    key: "sport",
    label: "Sport",
    description:
      "___ – für dein nächstes Trainingslevel.\n\nFeatures:\n- Rutschfest und strapazierfähig\n- Ideal für Zuhause und unterwegs\n- Für Einsteiger und Profis\n\nEinsatzbereich: ___.",
    stock: 100,
    shippingMinDays: 2,
    shippingMaxDays: 5,
    discountPercent: 10,
    categorySlug: "sport",
  },
  {
    key: "spielzeug",
    label: "Spielzeug",
    description:
      "___ – Spielspaß, der begeistert.\n\nDas macht es besonders:\n- Fördert Kreativität und Motorik\n- Kindgerechtes, sicheres Material\n- Empfohlen ab ___ Jahren\n\nAchtung: Nicht für Kinder unter 3 Jahren geeignet (Kleinteile).",
    stock: 150,
    shippingMinDays: 2,
    shippingMaxDays: 5,
    discountPercent: 5,
    categorySlug: "spielzeug",
  },
  {
    key: "buecher",
    label: "Bücher",
    description:
      "___ – ein Buch, das man nicht mehr aus der Hand legt.\n\nInhalt:\n- Spannend von der ersten bis zur letzten Seite\n- Von Leserinnen und Lesern hoch bewertet\n\nUmfang: ___ Seiten. Sprache: Deutsch.",
    stock: 60,
    shippingMinDays: 1,
    shippingMaxDays: 3,
    discountPercent: 0,
    categorySlug: "buecher",
  },
  {
    key: "lebensmittel",
    label: "Lebensmittel",
    description:
      "___ – Genuss in bester Qualität.\n\nDarum lohnt es sich:\n- Sorgfältig ausgewählte Zutaten\n- Ohne unnötige Zusatzstoffe\n- Frisch verpackt\n\nZutaten: ___. Kühl und trocken lagern.",
    stock: 300,
    shippingMinDays: 1,
    shippingMaxDays: 2,
    discountPercent: 5,
    categorySlug: "lebensmittel",
  },
  {
    key: "tierbedarf",
    label: "Tierbedarf",
    description:
      "___ – weil dein Liebling das Beste verdient.\n\nVorteile:\n- Tierfreundliche, geprüfte Materialien\n- Leicht zu reinigen\n- Für ___ geeignet\n\nGröße/Portionierung bitte passend zum Tier wählen.",
    stock: 90,
    shippingMinDays: 2,
    shippingMaxDays: 4,
    discountPercent: 10,
    categorySlug: "tierbedarf",
  },
  {
    key: "auto",
    label: "Auto",
    description:
      "___ – praktisches Zubehör für dein Fahrzeug.\n\nHighlights:\n- Passgenau und einfach zu montieren\n- Witterungsbeständig\n- Kompatibel mit ___\n\nMontagehinweis liegt bei.",
    stock: 40,
    shippingMinDays: 3,
    shippingMaxDays: 7,
    discountPercent: 10,
    categorySlug: "auto",
  },
];

export function getTemplate(key: string | undefined): ProductTemplate | null {
  if (!key) return null;
  return TEMPLATES.find((t) => t.key === key) ?? null;
}
