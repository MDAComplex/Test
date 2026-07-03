// ~50 wichtige Länder für Checkout & Adressbuch (deutsche Namen).
// Reihenfolge: DACH zuerst, dann Europa, dann Übersee.

export type Country = { code: string; name: string };

export const COUNTRIES: Country[] = [
  { code: "CH", name: "Schweiz" },
  { code: "DE", name: "Deutschland" },
  { code: "AT", name: "Österreich" },
  { code: "FR", name: "Frankreich" },
  { code: "IT", name: "Italien" },
  { code: "US", name: "USA" },
  { code: "GB", name: "Vereinigtes Königreich" },
  { code: "NL", name: "Niederlande" },
  { code: "BE", name: "Belgien" },
  { code: "ES", name: "Spanien" },
  { code: "PT", name: "Portugal" },
  { code: "PL", name: "Polen" },
  { code: "CZ", name: "Tschechien" },
  { code: "DK", name: "Dänemark" },
  { code: "SE", name: "Schweden" },
  { code: "NO", name: "Norwegen" },
  { code: "FI", name: "Finnland" },
  { code: "IE", name: "Irland" },
  { code: "LU", name: "Luxemburg" },
  { code: "LI", name: "Liechtenstein" },
  { code: "CA", name: "Kanada" },
  { code: "AU", name: "Australien" },
  { code: "NZ", name: "Neuseeland" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "Südkorea" },
  { code: "CN", name: "China" },
  { code: "IN", name: "Indien" },
  { code: "BR", name: "Brasilien" },
  { code: "MX", name: "Mexiko" },
  { code: "AR", name: "Argentinien" },
  { code: "TR", name: "Türkei" },
  { code: "GR", name: "Griechenland" },
  { code: "HU", name: "Ungarn" },
  { code: "SK", name: "Slowakei" },
  { code: "SI", name: "Slowenien" },
  { code: "HR", name: "Kroatien" },
  { code: "RO", name: "Rumänien" },
  { code: "BG", name: "Bulgarien" },
  { code: "EE", name: "Estland" },
  { code: "LV", name: "Lettland" },
  { code: "LT", name: "Litauen" },
  { code: "IS", name: "Island" },
  { code: "SG", name: "Singapur" },
  { code: "HK", name: "Hongkong" },
  { code: "AE", name: "Vereinigte Arabische Emirate" },
  { code: "SA", name: "Saudi-Arabien" },
  { code: "ZA", name: "Südafrika" },
  { code: "EG", name: "Ägypten" },
  { code: "TH", name: "Thailand" },
  { code: "VN", name: "Vietnam" },
  { code: "ID", name: "Indonesien" },
];

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export function countryName(code: string): string {
  return BY_CODE.get(code.toUpperCase())?.name ?? code;
}

export function isValidCountry(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}

/** Europäische Länder (für Versand-Laufzeiten). */
export const EUROPE_CODES = new Set([
  "CH", "DE", "AT", "LI", "FR", "IT", "GB", "NL", "BE", "ES", "PT", "PL", "CZ",
  "DK", "SE", "NO", "FI", "IE", "LU", "TR", "GR", "HU", "SK", "SI", "HR", "RO",
  "BG", "EE", "LV", "LT", "IS",
]);
