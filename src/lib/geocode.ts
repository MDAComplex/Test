// Serverseitiges Geocoding über die freie Nominatim-API (OpenStreetMap, kein API-Key).
// Fällt bei Nichterreichbarkeit (z. B. Sandbox-Proxy in dev) sauber auf eine
// eingebaute Städte-/Länder-Tabelle zurück.

import { countryName } from "@/lib/countries";

export type GeoPoint = { lat: number; lng: number };

// Zentroiden großer Städte (Schlüssel klein geschrieben).
const CITY_CENTROIDS: Record<string, GeoPoint> = {
  "zürich": { lat: 47.3769, lng: 8.5417 },
  zuerich: { lat: 47.3769, lng: 8.5417 },
  zurich: { lat: 47.3769, lng: 8.5417 },
  bern: { lat: 46.948, lng: 7.4474 },
  genf: { lat: 46.2044, lng: 6.1432 },
  basel: { lat: 47.5596, lng: 7.5886 },
  berlin: { lat: 52.52, lng: 13.405 },
  "münchen": { lat: 48.1351, lng: 11.582 },
  muenchen: { lat: 48.1351, lng: 11.582 },
  hamburg: { lat: 53.5511, lng: 9.9937 },
  wien: { lat: 48.2082, lng: 16.3738 },
  paris: { lat: 48.8566, lng: 2.3522 },
  london: { lat: 51.5074, lng: -0.1278 },
  amsterdam: { lat: 52.3676, lng: 4.9041 },
  madrid: { lat: 40.4168, lng: -3.7038 },
  rom: { lat: 41.9028, lng: 12.4964 },
  "new york": { lat: 40.7128, lng: -74.006 },
};

// Länder-Zentroiden (grob, ausreichend für die Demo-Karte).
const COUNTRY_CENTROIDS: Record<string, GeoPoint> = {
  CH: { lat: 46.8182, lng: 8.2275 },
  DE: { lat: 51.1657, lng: 10.4515 },
  AT: { lat: 47.5162, lng: 14.5501 },
  FR: { lat: 46.2276, lng: 2.2137 },
  IT: { lat: 41.8719, lng: 12.5674 },
  US: { lat: 39.8283, lng: -98.5795 },
  GB: { lat: 54.0, lng: -2.0 },
  NL: { lat: 52.1326, lng: 5.2913 },
  ES: { lat: 40.4637, lng: -3.7492 },
};

// Generischer Europa-Fallback (irgendwo in Mitteleuropa).
const EUROPE_FALLBACK: GeoPoint = { lat: 50.0, lng: 9.0 };

// Modul-weiter Cache (überlebt Requests im selben Server-Prozess).
const cache = new Map<string, GeoPoint | null>();

async function nominatim(params: Record<string, string>): Promise<GeoPoint | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "viralo-shop-demo" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat?: string; lon?: string }[];
    const hit = data?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    // Timeout / Netzwerkfehler (z. B. Sandbox ohne Nominatim-Zugriff) → Fallbacks.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Adresse → Koordinaten. Auflösungsreihenfolge:
 * 1. Nominatim (PLZ + Ort + Land) → 2. Nominatim (Ort + Land)
 * 3. Städte-Tabelle → 4. Länder-Zentroid → 5. null.
 */
export async function geocodeAddress(zip: string, city: string, country: string): Promise<GeoPoint | null> {
  const code = country.trim().toUpperCase();
  const cityKey = city.trim().toLowerCase();
  const key = `${zip.trim()}|${cityKey}|${code}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const countryNm = countryName(code);

  let result =
    (await nominatim({ postalcode: zip.trim(), city: city.trim(), country: countryNm })) ??
    (await nominatim({ city: city.trim(), country: countryNm }));

  if (!result) result = CITY_CENTROIDS[cityKey] ?? null;
  if (!result) result = COUNTRY_CENTROIDS[code] ?? null;
  if (!result && code && code !== "US") {
    // Für unbekannte (meist europäische) Länder: generischer Europa-Fallback.
    result = EUROPE_FALLBACK;
  }

  cache.set(key, result);
  return result;
}
