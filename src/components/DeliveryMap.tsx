"use client";

// Leaflet-Karte für die fiktive Lieferroute (Viralo Fulfillment Center, LA → Kundenadresse).
// Bewusst PLAIN Leaflet (kein react-leaflet) wegen React-19/Next-16-Peer-Konflikten.
// Nur divIcon-Marker — die Standard-Icon-PNGs von Leaflet brechen unter Bundlern.

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type DeliveryMapProps = {
  destLat: number;
  destLng: number;
  destLabel: string;
  /** 0..1 — Position des Pakets entlang der Route. */
  progress: number;
  etaText: string;
};

const ORIGIN: [number, number] = [34.05, -118.24];
const ORIGIN_LABEL = "Viralo Fulfillment Center, Los Angeles";

/** Leicht gebogener Bogen (quadratische Bezier) zwischen zwei Punkten. */
function arcPoints(a: [number, number], b: [number, number], n = 50): [number, number][] {
  const midLat = (a[0] + b[0]) / 2;
  const midLng = (a[1] + b[1]) / 2;
  // Kontrollpunkt senkrecht zur Strecke versetzt → sichtbare Krümmung.
  const dLat = b[0] - a[0];
  const dLng = b[1] - a[1];
  const dist = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
  const ctrl: [number, number] = [midLat + (-dLng / dist) * dist * 0.18, midLng + (dLat / dist) * dist * 0.18];
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const lat = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * ctrl[0] + t * t * b[0];
    const lng = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * ctrl[1] + t * t * b[1];
    pts.push([lat, lng]);
  }
  return pts;
}

function dotIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const PACKAGE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="M3.3 7 12 12l8.7-5"/><path d="M12 22V12"/></svg>';

function packageIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#ff5a1f;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center">${PACKAGE_SVG}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export default function DeliveryMap({ destLat, destLng, destLabel, progress, etaText }: DeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const dest: [number, number] = [destLat, destLng];
    const map = L.map(containerRef.current, { scrollWheelZoom: false, attributionControl: true });
    mapRef.current = map;

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    }).addTo(map);

    const route = arcPoints(ORIGIN, dest);
    L.polyline(route, { color: "#ff5a1f", weight: 3, dashArray: "6 8", opacity: 0.9 }).addTo(map);

    L.marker(ORIGIN, { icon: dotIcon("#1c1c1f") }).addTo(map).bindPopup(ORIGIN_LABEL);
    L.marker(dest, { icon: dotIcon("#1faa59") }).addTo(map).bindPopup(destLabel);

    const p = Math.min(Math.max(progress, 0), 1);
    const pkgPos = route[Math.round(p * (route.length - 1))];
    L.marker(pkgPos, { icon: packageIcon(), zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(`Dein Paket · ${etaText}`);

    map.fitBounds(L.latLngBounds([ORIGIN, dest]), { padding: [30, 30] });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [destLat, destLng, destLabel, progress, etaText]);

  return (
    <div>
      <div
        ref={containerRef}
        className="h-[300px] w-full rounded-xl overflow-hidden border border-[#e5e5e8]"
        aria-label={`Lieferroute von ${ORIGIN_LABEL} nach ${destLabel}`}
      />
      <p className="text-xs text-[#6b6b76] mt-2">
        Fiktive Route: {ORIGIN_LABEL} → {destLabel} · {etaText}
      </p>
    </div>
  );
}
