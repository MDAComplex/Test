import { WeaponLoot, wKind, rollRarity, GROUND_RARITY } from './weapons';
import { WORLD } from './config';
import { mulberry32 } from './rng';

export type ObsKind = 'tree' | 'rock' | 'crate' | 'chest' | 'airdrop' | 'wall' | 'bush' | 'water' | 'fence' | 'barrel' | 'hay' | 'box';
export interface Obs {
  kind: ObsKind; x: number; y: number; r: number; w: number; h: number;
  /** Farbe und Höhe (nur 'box') */
  c?: number; tall?: number;
  /** unsichtbare Kollision (das Modell kommt aus den Requisiten) */
  hide?: boolean;
  /** goldene Truhe (besonderer Loot) */
  gold?: boolean;
}
export type LootKind = 'ammo' | 'ammo6' | 'armor' | 'armor25' | 'medkit' | 'bigmed' | WeaponLoot;
export interface LootSpawn { x: number; y: number; kind: LootKind }
export interface Door { x: number; y: number; nx: number; ny: number }
export type HouseStyle = 'normal' | 'snow' | 'west' | 'jp' | 'log' | 'barn' | 'factory' | 'shop' | 'hall' | 'beach';
export interface House { x: number; y: number; s: number; doors: Door[]; style?: HouseStyle; garden?: boolean }
export interface Area { x: number; y: number; r: number }
export interface Field { x: number; y: number; w: number; h: number }
/** Deko-Objekt: k = Art, a = Drehung, s = Größe, c = Farbe */
export interface Prop { k: string; x: number; y: number; a?: number; s?: number; c?: number; h?: number }
export interface Road { pts: { x: number; y: number }[]; w: number; dirt?: boolean }
export interface Bridge { x: number; y: number; angle: number; style?: 'wood' | 'stone' | 'rope' }
export interface MapData {
  seed: number;
  obstacles: Obs[];
  loot: LootSpawn[];
  houses: House[];
  forests: Area[];
  ponds: (Area & { ice?: boolean; koi?: boolean })[];
  fields: Field[];
  town: Area;
  /** Fluss als Linienzug mit Breite, Brücken mit Mittelpunkt und Richtung des Flusses */
  river: { pts: { x: number; y: number }[]; width: number; bridges: Bridge[]; water: { x: number; y: number }[] };
  /** hohe Grasfelder: darin ist man unsichtbar */
  grass: Area[];
  /** benannte Orte */
  pois: Poi[];
  /** Straßen (Asphalt) und Erdwege */
  roads: Road[];
  ring: { x: number; y: number; r: number; w: number };
  /** Regionen mit eigenem Boden und eigener Vegetation */
  regions: Region[];
  props: Prop[];
  /** Plätze mit Pflaster (Stadt, Hafen, Industrie) */
  plazas: Area[];
}

export interface Poi { name: string; x: number; y: number; r: number; big: boolean }
export type RegionKind = 'snow' | 'desert' | 'forest' | 'grove' | 'beach' | 'farm' | 'industry' | 'city';
export interface Region { kind: RegionKind; x: number; y: number; r: number }

// ---------- Insel ----------
/** Umrechnung der Entwurfs-Koordinaten (Mock-Karte 2400 px) in Spielwelt-Einheiten */
const K = WORLD / 2400;
export const ISLAND = { x: 1200 * K, y: 1190 * K, r: 1040 * K };
/** Abstand Inselmitte -> Küste in Richtung a (gleiche Form wie die Mock-Karte) */
export function landRadius(a: number) {
  const wob = 0.08, ph = 1.3;
  return ISLAND.r * (1 + Math.sin(a * 3 + ph + 12) * wob + Math.sin(a * 5 + 11.9) * wob * 0.6 + Math.sin(a * 11 + ph) * wob * 0.25);
}
const dirTo = (mx: number, my: number) => { const a = Math.atan2(my * K - ISLAND.y, mx * K - ISLAND.x); return { a, dx: Math.cos(a), dy: Math.sin(a), R: landRadius(a) }; };
/** kleine Leuchtturm-Insel vor der Südostküste */
const LH = dirTo(1560, 2050);
export const ISLETS: Area[] = [{ x: ISLAND.x + LH.dx * (LH.R + 380), y: ISLAND.y + LH.dy * (LH.R + 380), r: 230 }];
export interface Pier { x1: number; y1: number; x2: number; y2: number; w: number }
const PH = dirTo(1200, 1985);
export const PIERS: Pier[] = [
  // Holzsteg zur Leuchtturm-Insel
  { x1: ISLAND.x + LH.dx * (LH.R - 170), y1: ISLAND.y + LH.dy * (LH.R - 170), x2: ISLAND.x + LH.dx * (LH.R + 230), y2: ISLAND.y + LH.dy * (LH.R + 230), w: 120 },
  // Hafensteg in Port Haven
  { x1: ISLAND.x + PH.dx * (PH.R - 170), y1: ISLAND.y + PH.dy * (PH.R - 170), x2: ISLAND.x + PH.dx * (PH.R + 560), y2: ISLAND.y + PH.dy * (PH.R + 560), w: 130 },
];
function pierLocal(p: Pier, x: number, y: number) {
  const vx = p.x2 - p.x1, vy = p.y2 - p.y1, L = Math.hypot(vx, vy), ux = vx / L, uy = vy / L;
  const t = (x - p.x1) * ux + (y - p.y1) * uy, s = -(x - p.x1) * uy + (y - p.y1) * ux;
  return { t, s, L, ux, uy };
}
function onExtra(x: number, y: number, pad: number) {
  for (const i of ISLETS) if (Math.hypot(x - i.x, y - i.y) < i.r - Math.min(pad, i.r * 0.4)) return true;
  for (const p of PIERS) { const q = pierLocal(p, x, y); if (q.t >= 0 && q.t <= q.L && Math.abs(q.s) < p.w / 2 - Math.min(pad, 24)) return true; }
  return false;
}
/** liegt der Punkt auf der Insel (mit Abstand pad zur Küste)? Stege und die Leuchtturm-Insel zählen mit */
export function isLand(x: number, y: number, pad = 0) {
  const dx = x - ISLAND.x, dy = y - ISLAND.y;
  if (Math.hypot(dx, dy) < landRadius(Math.atan2(dy, dx)) - pad) return true;
  return onExtra(x, y, pad);
}
/** nur die Hauptinsel (für Platzierung von Häusern usw.) */
export function isMainLand(x: number, y: number, pad = 0) {
  const dx = x - ISLAND.x, dy = y - ISLAND.y;
  return Math.hypot(dx, dy) < landRadius(Math.atan2(dy, dx)) - pad;
}
/** Figur an Land halten: nächster erlaubter Punkt (Insel, Steg oder Leuchtturm-Insel) */
export function clampToLand(x: number, y: number, pad = 70) {
  if (isMainLand(x, y, pad) || onExtra(x, y, 24)) return null;
  const cands: { x: number; y: number }[] = [];
  const dx = x - ISLAND.x, dy = y - ISLAND.y, d = Math.hypot(dx, dy) || 1, lim = landRadius(Math.atan2(dy, dx)) - pad;
  cands.push({ x: ISLAND.x + (dx / d) * lim, y: ISLAND.y + (dy / d) * lim });
  for (const i of ISLETS) { const e = Math.hypot(x - i.x, y - i.y) || 1, rr = i.r - 26; cands.push({ x: i.x + (x - i.x) / e * rr, y: i.y + (y - i.y) / e * rr }); }
  for (const p of PIERS) {
    const q = pierLocal(p, x, y), t = Math.max(0, Math.min(q.L, q.t)), sl = p.w / 2 - 26, s = Math.max(-sl, Math.min(sl, q.s));
    cands.push({ x: p.x1 + q.ux * t - q.uy * s, y: p.y1 + q.uy * t + q.ux * s });
  }
  let best = cands[0], bd = Infinity;
  for (const c of cands) { const e = (c.x - x) ** 2 + (c.y - y) ** 2; if (e < bd) { bd = e; best = c; } }
  return best;
}
/** Küstenlinie als Polygon (n Punkte, im Uhrzeigersinn ab Osten) */
export function coastPolygon(n = 240, inset = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, r = landRadius(a) - inset;
    return { x: ISLAND.x + Math.cos(a) * r, y: ISLAND.y + Math.sin(a) * r };
  });
}
/** Breite des Sandstrands an der Küste */
export const BEACH_W = 210;

export const ROCK_SIZES = [28, 38, 48];
/** Radius der unsichtbaren Geländer-Kollision an Brücken */
export const RAIL_R = 12;
/** Dorfplatz (frei von Häusern) und Brunnen (Kollision) */
export const PLAZA_R = 340;
export const FOUNTAIN_R = 70;

export function randomLootKind(r: () => number): LootKind {
  // Verteilung: Munition 45 %, Waffen 27 %, Heilung 18 %, Schild 10 %
  const v = r();
  if (v < 0.27) {
    const w = r();
    // mehr Pistolen, weil alle ohne Waffe starten
    return wKind(w < 0.32 ? 'pistol' : w < 0.56 ? 'smg' : w < 0.74 ? 'shotgun' : w < 0.92 ? 'rifle' : 'sniper', rollRarity(r, GROUND_RARITY));
  }
  // Munition: meist 3er-Packung, seltener die 6er-Packung
  if (v < 0.72) return r() < 0.22 ? 'ammo6' : 'ammo';
  // Schilde: kleines (+25) häufig, großes (+50) seltener
  if (v < 0.82) return r() < 0.68 ? 'armor25' : 'armor';
  return v < 0.95 ? 'medkit' : 'bigmed';
}

type P2 = { x: number; y: number };
const segDist = (x: number, y: number, a: P2, b: P2) => {
  const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2));
  return Math.hypot(x - a.x - vx * t, y - a.y - vy * t);
};
const segsCross = (a: P2, b: P2, c: P2, d: P2) => {
  const o = (p: P2, q: P2, r: P2) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
};

/** feste Karte: Aufbau ist immer gleich, nur welche Gegenstände wo liegen, wechselt pro Runde */
export const LAYOUT_SEED = 20261127;
let cached: Omit<MapData, 'seed' | 'loot'> & { lootSpots: { x: number; y: number }[] } | null = null;

export function generateMap(seed: number): MapData {
  if (!cached) cached = buildLayout();
  const rl = mulberry32(seed);
  // Loot: feste Plätze, Art wechselt pro Runde
  const loot = cached.lootSpots.map((p) => ({ x: p.x, y: p.y, kind: randomLootKind(rl) }));
  const c = cached;
  // Kopien, damit eine Runde die gemeinsame Karte nicht verändert
  return {
    ...c, seed, loot,
    obstacles: c.obstacles.map((o) => ({ ...o })),
    houses: c.houses.map((h) => ({ ...h, doors: h.doors.map((d) => ({ ...d })) })),
  };
}

function buildLayout() {
  const r = mulberry32(LAYOUT_SEED);
  const obstacles: Obs[] = [];
  const loot: { x: number; y: number }[] = [];
  const houses: House[] = [];
  const forests: Area[] = [];
  const ponds: MapData['ponds'] = [];
  const fields: Field[] = [];
  const props: Prop[] = [];
  const plazas: Area[] = [];
  const blocks: { x: number; y: number; r: number }[] = [];
  const P = (x: number, y: number) => ({ x: x * K, y: y * K });

  const fits = (x: number, y: number, rad: number, pad: number) => {
    if (!isMainLand(x, y, rad + 60)) return false;
    for (const b of blocks) {
      const dx = b.x - x, dy = b.y - y, m = b.r + rad + pad;
      if (dx * dx + dy * dy < m * m) return false;
    }
    return true;
  };
  const place = (rad: number, pad = 30, tries = 60) => {
    for (let i = 0; i < tries; i++) {
      const x = r() * WORLD, y = r() * WORLD;
      if (fits(x, y, rad, pad)) return { x, y };
    }
    return null;
  };
  const LOOT_GAP = 80;
  const addLoot = (x: number, y: number) => {
    if (!isLand(x, y, 40)) return false;
    for (const l of loot) if ((l.x - x) ** 2 + (l.y - y) ** 2 < LOOT_GAP * LOOT_GAP) return false;
    for (const o of obstacles) {
      if ((o.kind === 'wall' || o.kind === 'box') && Math.abs(o.x - x) < o.w / 2 + 30 && Math.abs(o.y - y) < o.h / 2 + 30) return false;
      if ((o.kind === 'water' || o.kind === 'rock' || o.kind === 'tree') && Math.hypot(o.x - x, o.y - y) < o.r + 30) return false;
      if (o.kind !== 'chest' && o.kind !== 'crate') continue;
      if (Math.abs(o.x - x) < o.w / 2 + 40 && Math.abs(o.y - y) < o.h / 2 + 40) return false;
    }
    loot.push({ x, y });
    return true;
  };
  const placeNear = (cx: number, cy: number, spread: number, rad: number, pad = 30, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * spread;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (fits(x, y, rad, pad)) return { x, y };
    }
    return null;
  };
  const onLand = (p: P2, pad: number) => {
    let { x, y } = p;
    for (let i = 0; i < 60 && !isMainLand(x, y, pad); i++) { x += (ISLAND.x - x) * 0.04; y += (ISLAND.y - y) * 0.04; }
    return { x, y };
  };
  /** Requisit mit Kollision: unsichtbarer Block, Platz wird reserviert */
  const solid = (x: number, y: number, w: number, h: number, pad = 20) => {
    obstacles.push({ kind: 'box', x, y, w, h, r: 0, hide: true });
    blocks.push({ x, y, r: Math.max(w, h) * 0.6 + pad });
  };
  const prop = (k: string, x: number, y: number, o: Partial<Prop> = {}) => { props.push({ k, x, y, ...o }); };

  // ---------- Orte und Regionen ----------
  const poiDefs: [string, number, number, number, boolean][] = [
    ['Old Town', 1215, 990, 330, true], ['Pinewood', 440, 600, 300, true], ['Frost Station', 1170, 330, 220, true],
    ['Dusty Mesa', 1820, 470, 240, true], ['Steel Works', 1990, 1010, 220, true], ['Blossom Temple', 1870, 1690, 230, true],
    ['Sunny Farm', 560, 1420, 240, true], ['Port Haven', 1200, 1900, 220, true],
    ['Ranger Tower', 470, 420, 70, false], ['Campsite', 330, 790, 80, false], ['Timber Cabins', 700, 640, 90, false],
    ['Misty Falls', 300, 1060, 90, false], ['Water Tower', 660, 460, 60, false], ['Windpump Ranch', 1640, 330, 90, false],
    ['Rust Quarry', 2000, 700, 130, false], ['Signal Tower', 1700, 1240, 70, false], ['Maple Village', 1870, 1330, 140, false],
    ['Palm Beach', 520, 1860, 160, false], ['Cliffside', 330, 1640, 110, false], ['Lighthouse', 1560, 2050, 70, false],
  ];
  const pois: Poi[] = poiDefs.map(([name, x, y, rr, big]) => { const q = onLand(P(x, y), big ? 560 : 340); return { name, x: q.x, y: q.y, r: rr * K, big }; });
  const poi = (n: string) => pois.find((q) => q.name === n)!;
  // Leuchtturm steht auf der kleinen Insel
  Object.assign(poi('Lighthouse'), { x: ISLETS[0].x, y: ISLETS[0].y, r: 260 });
  const regions: Region[] = [
    { kind: 'snow', ...P(1160, 300), r: 520 * K }, { kind: 'desert', ...P(1880, 500), r: 520 * K }, { kind: 'forest', ...P(450, 600), r: 500 * K },
    { kind: 'grove', ...P(1880, 1640), r: 450 * K }, { kind: 'beach', ...P(1060, 2030), r: 400 * K }, { kind: 'beach', ...P(440, 1880), r: 320 * K },
    { kind: 'farm', ...P(560, 1440), r: 300 * K }, { kind: 'industry', ...P(2000, 1020), r: 280 * K }, { kind: 'city', ...P(1215, 990), r: 360 * K },
  ];
  const regionAt = (x: number, y: number, lim = 1): RegionKind | null => {
    let best: RegionKind | null = null, bd = Infinity;
    for (const g of regions) { const d = Math.hypot(g.x - x, g.y - y) / g.r; if (d < lim && d < bd) { bd = d; best = g.kind; } }
    return best;
  };
  const region = (k: RegionKind) => regions.find((g) => g.kind === k)!;

  // ---------- Straßen ----------
  const C = poi('Old Town');
  const RING_R = 1700;
  const ring = { x: C.x, y: C.y, r: RING_R, w: 120 };
  // [Punkte, Erdweg?]
  const roadDefs: [number[][], boolean][] = [
    // Hauptstraßen von der Ringstraße zu den großen Orten
    [[[1215, 600], [1215, 520], [1180, 400], [1170, 330]], false],
    [[[1600, 900], [1700, 840], [1780, 700], [1820, 560], [1820, 470]], false],
    [[[1640, 1060], [1800, 1040], [1990, 1010]], false],
    [[[1520, 1290], [1620, 1380], [1720, 1500], [1870, 1690]], false],
    [[[1215, 1400], [1215, 1600], [1200, 1780], [1200, 1900]], false],
    [[[880, 1240], [760, 1330], [620, 1380], [560, 1420]], false],
    [[[810, 980], [680, 940], [560, 860], [480, 740], [440, 600]], false],
    // Verbindungen zwischen den Orten
    [[[560, 1420], [540, 1620], [520, 1860]], false],
    [[[1170, 330], [1380, 360], [1640, 330]], true],
    [[[1640, 330], [1820, 470]], true],
    [[[1720, 1500], [1700, 1240], [1870, 1330]], false],
    [[[1215, 1600], [1420, 1660], [1720, 1500]], false],
    [[[620, 1380], [880, 1560], [1200, 1780]], false],
    // Erdwege zu den kleinen Orten
    [[[1820, 700], [2000, 700]], true],
    [[[480, 740], [330, 790]], true],
    [[[440, 600], [470, 420]], true],
    [[[560, 860], [700, 640], [660, 460]], true],
    [[[480, 740], [380, 900], [300, 1020]], true],
    [[[540, 1620], [330, 1640]], true],
    [[[1420, 1660], [1500, 1880], (() => { const p = PIERS[0]; return [p.x1 / K, p.y1 / K]; })()], true],
    [[[1870, 1690], [1980, 1800]], true],
  ];
  const roads: Road[] = roadDefs.map(([pts, dirt]) => ({ pts: pts.map(([x, y]) => onLand(P(x, y), 200)), w: dirt ? 80 : 120, dirt }));
  // die Erdstraße zur Leuchtturm-Insel endet genau am Steg
  roads[roads.length - 2].pts[2] = { x: PIERS[0].x1, y: PIERS[0].y1 };
  // Straßen, die in der Stadt beginnen, starten genau an der Ringstraße
  for (const rd of roads) {
    const a = rd.pts[0], d = Math.hypot(a.x - C.x, a.y - C.y);
    if (d < RING_R + 200) rd.pts[0] = { x: C.x + (a.x - C.x) / d * RING_R, y: C.y + (a.y - C.y) / d * RING_R };
  }
  // Innenstraßen der Stadt (Kreuz vom Platz zum Ring)
  // (nach Norden erst hinter dem Rathaus)
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { const r0 = a === Math.PI * 1.5 ? PLAZA_R + 640 : PLAZA_R + 60; roads.push({ pts: [{ x: C.x + Math.cos(a) * r0, y: C.y + Math.sin(a) * r0 }, { x: C.x + Math.cos(a) * RING_R, y: C.y + Math.sin(a) * RING_R }], w: 100 }); }
  // Straßen im Hafen zum Steg
  { const p = PIERS[1]; const q = poi('Port Haven'); roads.push({ pts: [{ x: q.x, y: q.y }, { x: p.x1, y: p.y1 }], w: 100 }); }
  const roadSamples: { x: number; y: number; w: number; dirt: boolean }[] = [];
  const sampleRoad = (rd: Road) => {
    for (let i = 0; i < rd.pts.length - 1; i++) {
      const a = rd.pts[i], b = rd.pts[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 50);
      for (let k = 0; k <= n; k++) roadSamples.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, w: rd.w, dirt: !!rd.dirt });
    }
  };
  roads.forEach(sampleRoad);
  for (let i = 0; i < 140; i++) { const a = i / 140 * Math.PI * 2; roadSamples.push({ x: C.x + Math.cos(a) * RING_R, y: C.y + Math.sin(a) * RING_R, w: ring.w, dirt: false }); }

  // ---------- Fluss: vom Wasserfall an der Westklippe um die Stadt herum zum Meer im Süden ----------
  const RIVER_W = 210;
  const pts = [[300, 1062], [420, 1060], [560, 990], [680, 1020], [720, 1190], [800, 1390], [960, 1520], [1090, 1560], [1110, 1700], [990, 1850], [910, 2010], [880, 2320]].map(([x, y]) => P(x, y));
  const samples: { x: number; y: number; a: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(len / 50);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) });
    }
  }
  const bridges: Bridge[] = [];
  const styleAt = (x: number, y: number): Bridge['style'] => { const g = regionAt(x, y, 1.3); return g === 'farm' || g === 'city' ? 'stone' : 'wood'; };
  // Brücken dort, wo Straßen (auch Erdwege) den Fluss kreuzen
  for (const sp of samples) {
    if (!isMainLand(sp.x, sp.y, 300)) continue;
    const hit = roadSamples.some((q) => Math.hypot(q.x - sp.x, q.y - sp.y) < 40);
    if (hit && bridges.every((b) => Math.hypot(b.x - sp.x, b.y - sp.y) > 700)) bridges.push({ x: sp.x, y: sp.y, angle: sp.a, style: styleAt(sp.x, sp.y) });
  }
  // zusätzliche Fußgängerbrücken, damit man nie weit laufen muss (eine davon als Hängebrücke)
  {
    let rope = false;
    for (let i = 0; i < samples.length; i += 4) {
      const sp = samples[i];
      if (!isMainLand(sp.x, sp.y, 420)) continue;
      if (bridges.some((b) => Math.hypot(b.x - sp.x, b.y - sp.y) < 1500)) continue;
      if (roadSamples.some((q) => Math.hypot(q.x - sp.x, q.y - sp.y) < 300)) continue;
      const st: Bridge['style'] = !rope && regionAt(sp.x, sp.y, 1.4) !== 'city' ? 'rope' : styleAt(sp.x, sp.y);
      if (st === 'rope') rope = true;
      bridges.push({ x: sp.x, y: sp.y, angle: sp.a, style: st });
    }
  }
  for (const sp of samples) {
    if (bridges.some((b) => Math.hypot(b.x - sp.x, b.y - sp.y) < RIVER_W / 2 + 64)) continue;
    obstacles.push({ kind: 'water', x: sp.x, y: sp.y, r: RIVER_W / 2, w: RIVER_W, h: RIVER_W });
  }
  for (const b of bridges) {
    const L = RIVER_W + 150, ax = Math.cos(b.angle), ay = Math.sin(b.angle), px = -ay, py = ax;
    for (const side of [-1, 1]) for (let t = -L / 2; t <= L / 2; t += 18) obstacles.push({ kind: 'water', x: b.x + px * t + ax * side * 58, y: b.y + py * t + ay * side * 58, r: RAIL_R, w: RAIL_R * 2, h: RAIL_R * 2 });
  }
  for (const sp of samples) blocks.push({ x: sp.x, y: sp.y, r: RIVER_W / 2 + 40 });
  for (const b of bridges) {
    const px = -Math.sin(b.angle), py = Math.cos(b.angle), half = (RIVER_W + 150) / 2;
    for (const side of [-1, 1]) for (const d of [half, half + 90, half + 180]) blocks.push({ x: b.x + px * d * side, y: b.y + py * d * side, r: 95 });
  }
  const river = { pts, width: RIVER_W, bridges, water: samples.map((sp) => ({ x: sp.x, y: sp.y })) };
  // Ufer: Schilf, Seerosen und Steine (nur Deko)
  for (let i = 6; i < samples.length - 6; i += 3) {
    const sp = samples[i];
    if (!isMainLand(sp.x, sp.y, 260) || bridges.some((b) => Math.hypot(b.x - sp.x, b.y - sp.y) < 260)) continue;
    const nx = -Math.sin(sp.a), ny = Math.cos(sp.a), side = r() < 0.5 ? -1 : 1, v = r();
    if (v < 0.35) prop('reed', sp.x + nx * side * (RIVER_W / 2 - 10), sp.y + ny * side * (RIVER_W / 2 - 10), { a: r() * 6, s: 0.8 + r() * 0.5 });
    else if (v < 0.65) prop('lily', sp.x + nx * side * (RIVER_W / 2 - 40), sp.y + ny * side * (RIVER_W / 2 - 40), { a: r() * 6, s: 0.8 + r() * 0.4 });
    else if (v < 0.75) prop('stone', sp.x + nx * side * (RIVER_W / 2 + 25), sp.y + ny * side * (RIVER_W / 2 + 25), { a: r() * 6, s: 0.7 + r() * 0.6 });
  }
  // Straßen frei halten
  for (const q of roadSamples) blocks.push({ x: q.x, y: q.y, r: q.w / 2 + 20 });
  // Stege und Leuchtturm-Insel frei halten
  for (const p of PIERS) for (let t = 0; t <= 1; t += 0.1) blocks.push({ x: p.x1 + (p.x2 - p.x1) * t, y: p.y1 + (p.y2 - p.y1) * t, r: p.w });

  // ---------- Teiche ----------
  const pondDefs: [number, number, number, 'ice' | 'koi' | ''][] = [[960, 300, 70, 'ice'], [2010, 1760, 70, 'koi'], [1500, 760, 52, ''], [760, 1700, 50, '']];
  for (const [x, y, rr, t] of pondDefs) {
    const q = P(x, y), rad = rr * K;
    if (!fits(q.x, q.y, rad + 40, 40)) continue;
    blocks.push({ x: q.x, y: q.y, r: rad + 60 });
    ponds.push({ x: q.x, y: q.y, r: rad, ice: t === 'ice', koi: t === 'koi' });
    // gefrorener Teich: begehbar (keine Wasser-Kollision)
    if (t !== 'ice') obstacles.push({ kind: 'water', x: q.x, y: q.y, r: rad, w: rad * 2, h: rad * 2 });
    if (t === 'koi') {
      // rote Bogenbrücke über den Koi-Teich (nur Optik) und Steinlaternen
      prop('koibridge', q.x, q.y, { s: rad });
      for (const a of [0.6, 2.2, 3.8, 5.3]) prop('stonelantern', q.x + Math.cos(a) * (rad + 70), q.y + Math.sin(a) * (rad + 70), { a });
    }
  }

  // ---------- Häuser ----------
  const town: Area = { x: C.x, y: C.y, r: RING_R };
  blocks.push({ x: town.x, y: town.y, r: PLAZA_R });
  plazas.push({ x: town.x, y: town.y, r: PLAZA_R });
  obstacles.push({ kind: 'water', x: town.x, y: town.y, r: FOUNTAIN_R, w: FOUNTAIN_R * 2, h: FOUNTAIN_R * 2 });
  prop('fountain', town.x, town.y);

  const styleFor = (x: number, y: number): HouseStyle => {
    const g = regionAt(x, y, 0.95);
    if (g === 'snow') return 'snow';
    if (g === 'desert') return 'west';
    if (g === 'grove') return 'jp';
    if (g === 'forest') return 'log';
    if (g === 'industry') return 'factory';
    if (g === 'farm') return 'barn';
    if (g === 'beach') return 'beach';
    return 'normal';
  };
  const addHouse = (p: P2, s: number, fenced: boolean, style?: HouseStyle, gold = false, allDoors = false) => {
    const house: House = { x: p.x, y: p.y, s, doors: [], style: style ?? styleFor(p.x, p.y), garden: fenced };
    houses.push(house);
    const t = 22, h = s / 2, door = 86;
    const doorA = Math.floor(r() * 4);
    const doorB = r() < 0.5 ? (doorA + 2) % 4 : -1;
    const addH = (y: number, a: number, b: number) => obstacles.push({ kind: 'wall', x: (a + b) / 2, y, w: b - a, h: t, r: 0 });
    const addV = (x: number, a: number, b: number) => obstacles.push({ kind: 'wall', x, y: (a + b) / 2, w: t, h: b - a, r: 0 });
    const seg = (horizontal: boolean, fixed: number, a: number, b: number, hasDoor: boolean) => {
      const add = horizontal ? addH : addV;
      if (!hasDoor) { add(fixed, a, b); return; }
      const mid = (a + b) / 2;
      add(fixed, a, mid - door / 2);
      add(fixed, mid + door / 2, b);
    };
    const isDoor = (side: number) => allDoors || side === doorA || side === doorB;
    const sideInfo = [
      { x: p.x, y: p.y - h, nx: 0, ny: -1 },
      { x: p.x, y: p.y + h, nx: 0, ny: 1 },
      { x: p.x - h, y: p.y, nx: -1, ny: 0 },
      { x: p.x + h, y: p.y, nx: 1, ny: 0 },
    ];
    for (let side = 0; side < 4; side++) if (isDoor(side)) house.doors.push(sideInfo[side]);
    seg(true, p.y - h + t / 2, p.x - h, p.x + h, isDoor(0));
    seg(true, p.y + h - t / 2, p.x - h, p.x + h, isDoor(1));
    seg(false, p.x - h + t / 2, p.y - h + t, p.y + h - t, isDoor(2));
    seg(false, p.x + h - t / 2, p.y - h + t, p.y + h - t, isDoor(3));
    if (s > 290 && !gold && !allDoors && r() < 0.75) {
      const gap = 92, clear = 115;
      const vertical = r() < 0.5;
      let a0 = (vertical ? p.y : p.x) - h + t, a1 = (vertical ? p.y : p.x) + h - t;
      if (vertical) { if (isDoor(0)) a0 += clear; if (isDoor(1)) a1 -= clear; }
      else { if (isDoor(2)) a0 += clear; if (isDoor(3)) a1 -= clear; }
      if (a1 - a0 > gap + 100) {
        const mid = a0 + 50 + gap / 2 + r() * (a1 - a0 - 100 - gap);
        const add = vertical ? addV : addH, fixed = vertical ? p.x : p.y;
        add(fixed, a0, mid - gap / 2);
        add(fixed, mid + gap / 2, a1);
      }
    }
    const chestAt = (cx: number, cy: number, g = false) => obstacles.push({ kind: 'chest', x: cx, y: cy, r: 22, w: 48, h: 28, gold: g || undefined });
    if (gold) chestAt(p.x, p.y, true);
    else if (r() < 0.75) chestAt(p.x - h + t + 36, p.y - h + t + 30);
    if (s > 320 && r() < 0.6) chestAt(p.x + h - t - 36, p.y + h - t - 30);
    const n = 1 + Math.floor(r() * 2) + (s > 330 ? 1 : 0);
    for (let k = 0; k < n; k++) for (let tries = 0; tries < 12; tries++) if (addLoot(p.x + (r() - 0.5) * (s - 150), p.y + (r() - 0.5) * (s - 150))) break;

    if (fenced) {
      const d = h + 70, ft = 10, gap = 100;
      const fenceH = (y: number) => {
        obstacles.push({ kind: 'fence', x: (p.x - d + p.x - gap / 2) / 2, y, w: d - gap / 2, h: ft, r: 0 });
        obstacles.push({ kind: 'fence', x: (p.x + gap / 2 + p.x + d) / 2, y, w: d - gap / 2, h: ft, r: 0 });
      };
      const fenceV = (x: number) => {
        obstacles.push({ kind: 'fence', x, y: (p.y - d + p.y - gap / 2) / 2, w: ft, h: d - gap / 2, r: 0 });
        obstacles.push({ kind: 'fence', x, y: (p.y + gap / 2 + p.y + d) / 2, w: ft, h: d - gap / 2, r: 0 });
      };
      fenceH(p.y - d);
      fenceH(p.y + d);
      if (r() < 0.5) fenceV(p.x - d); else fenceV(p.x + d);
      // Briefkasten am Gartentor
      prop('mailbox', p.x + gap / 2 + 18, p.y + d + 22, { a: 0 });
    }
    if (r() < 0.45) {
      const side = r() < 0.5 ? -1 : 1;
      const bx = p.x + side * (h + 34), by = p.y + (r() < 0.5 ? -1 : 1) * (90 + r() * Math.max(10, s * 0.3 - 90)) - 19;
      obstacles.push({ kind: 'barrel', x: bx, y: by, r: 17, w: 34, h: 34 });
      if (r() < 0.6) obstacles.push({ kind: 'barrel', x: bx, y: by + 38, r: 17, w: 34, h: 34 });
      blocks.push({ x: bx, y: by + 19, r: 80 });
    }
    return house;
  };

  /** n Häuser rund um einen Ort */
  const village = (p: P2, n: number, sMin: number, sMax: number, spread: number, fencedChance = 0.3, style?: HouseStyle) => {
    let made = 0;
    for (let i = 0; i < n * 5 && made < n; i++) {
      const s = sMin + Math.floor(r() * (sMax - sMin));
      const fenced = r() < fencedChance;
      const rad = s * 0.72 + (fenced ? 80 : 0);
      const q = placeNear(p.x, p.y, spread * 1.7 + 200, rad, 40, 40);
      if (!q) continue;
      blocks.push({ x: q.x, y: q.y, r: rad });
      addHouse(q, s, fenced, style);
      made++;
    }
  };

  // ---------- Tafelberge am Rand der Wüste (vor den Häusern, damit sie Platz finden) ----------
  {
    const dr = region('desert');
    for (let i = 0; i < 30 && props.filter((o) => o.k === 'mesa').length < 6; i++) {
      const s = 0.7 + r() * 0.45, rad = 140 * s;
      const ang = r() * Math.PI * 2, dd = dr.r * (0.6 + r() * 0.35);
      const q = fits(dr.x + Math.cos(ang) * dd, dr.y + Math.sin(ang) * dd, rad + 20, 30) ? { x: dr.x + Math.cos(ang) * dd, y: dr.y + Math.sin(ang) * dd } : null;
      if (!q) continue;
      obstacles.push({ kind: 'rock', x: q.x, y: q.y, r: rad, w: rad * 2, h: rad * 2, hide: true });
      blocks.push({ x: q.x, y: q.y, r: rad + 60 });
      prop('mesa', q.x, q.y, { s, a: r() * 6 });
    }
  }
  // ---------- Old Town ----------
  {
    // Rathaus mit Uhrturm im Norden des Platzes, goldene Truhe drinnen
    const hall = { x: C.x, y: C.y - PLAZA_R - 330 };
    blocks.push({ x: hall.x, y: hall.y, r: 310 });
    addHouse(hall, 440, false, 'hall', true);
    prop('clocktower', hall.x, hall.y, { s: 440 });
    // Läden direkt am Platz: Markise über der Tür, Tische mit Sonnenschirmen davor
    const shopRing = PLAZA_R + 320;
    for (const a of [0.47, 1.1, 2.04, 2.67, 3.61, 4.24, 5.18, 5.81]) {
      const x = C.x + Math.cos(a) * shopRing, y = C.y + Math.sin(a) * shopRing, s = 250 + Math.floor(r() * 40);
      if (!fits(x, y, s * 0.72, 20)) continue;
      blocks.push({ x, y, r: s * 0.72 });
      const hs = addHouse({ x, y }, s, false, 'shop');
      // Tür zur Platzseite drehen: die Tür, die am nächsten am Platz liegt
      const d = [...hs.doors].sort((u, v) => Math.hypot(u.x - C.x, u.y - C.y) - Math.hypot(v.x - C.x, v.y - C.y))[0];
      if (d) {
        prop('awning', d.x, d.y, { a: Math.atan2(d.ny, d.nx), c: [0xe2574c, 0x3d8cf0, 0x43c463, 0xf2b233][Math.floor(r() * 4)] });
        const tx = d.x + d.nx * 120 + d.ny * 70, ty = d.y + d.ny * 120 - d.nx * 70;
        if (Math.hypot(tx - C.x, ty - C.y) > FOUNTAIN_R + 90) prop('cafetable', tx, ty, { a: r() * 6, c: [0xffffff, 0xff8a6e, 0x7fc8ff][Math.floor(r() * 3)] });
      }
    }
    let made = 0;
    for (let i = 0; i < 1400 && made < 24; i++) {
      const a = r() * Math.PI * 2, d = PLAZA_R + 520 + r() * (RING_R - PLAZA_R - 760);
      const x = C.x + Math.cos(a) * d, y = C.y + Math.sin(a) * d, s = 240 + Math.floor(r() * 90);
      if (!fits(x, y, s * 0.72, 30)) continue;
      blocks.push({ x, y, r: s * 0.72 });
      addHouse({ x, y }, s, r() < 0.25);
      made++;
    }
    // Bäume rund um den Marktplatz
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + 0.3; obstacles.push({ kind: 'tree', x: C.x + Math.cos(a) * (PLAZA_R - 60), y: C.y + Math.sin(a) * (PLAZA_R - 60), r: 14, w: 28, h: 28 }); }
    // Laternen und Bänke am Platzrand, sparsam an den Straßen
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; prop(i % 2 ? 'bench' : 'lamp', C.x + Math.cos(a) * (PLAZA_R + 10), C.y + Math.sin(a) * (PLAZA_R + 10), { a: a + Math.PI / 2 }); }
  }

  // ---------- Wasserfall an der Flussquelle (Misty Falls), Platz früh reservieren ----------
  {
    const si = samples.findIndex((sp) => isMainLand(sp.x, sp.y, 260));
    const src = samples[Math.max(0, si)], dir = src.a;
    // Felsrücken an der Quelle, Wasser fällt vom Fels in den Fluss
    const wx = src.x, wy = src.y;
    prop('waterfall', wx, wy, { a: dir, s: 1 });
    for (const sd of [-1, 1]) {
      const x = wx - Math.sin(dir) * sd * (RIVER_W / 2 + 120), y = wy + Math.cos(dir) * sd * (RIVER_W / 2 + 120);
      obstacles.push({ kind: 'rock', x, y, r: 130, w: 260, h: 260, hide: true });
      blocks.push({ x, y, r: 190 });
      prop('cliffrock', x, y, { s: 1.6, a: r() * 6 });
    }
  }
  // ---------- Felder (Sunny Farm) ----------
  {
    const p = poi('Sunny Farm');
    for (const [dx, dy, w, h] of [[-380, 260, 520, 380], [300, 280, 440, 400], [-150, 700, 600, 280], [480, 760, 380, 300], [-620, -260, 400, 340]]) {
      const x = p.x + dx, y = p.y + dy;
      if (!fits(x, y, Math.max(w, h) * 0.55, 20)) continue;
      blocks.push({ x, y, r: Math.max(w, h) * 0.6 });
      fields.push({ x, y, w, h });
      for (let k = 0; k < 3; k++) {
        const hx = x + (r() - 0.5) * (w - 120), hy = y + (r() - 0.5) * (h - 100);
        if (obstacles.some((o) => o.kind === 'hay' && Math.hypot(o.x - hx, o.y - hy) < 110)) continue;
        obstacles.push({ kind: 'hay', x: hx, y: hy, r: 0, w: 72, h: 48 });
      }
      addLoot(x, y);
    }
  }

  const CC = [0xe2574c, 0x3d8cf0, 0xf2b233, 0x43c463, 0x9b6bff, 0xff8a2e];
  const near = (p: P2, spread: number, rad: number, pad = 20, tries = 40) => placeNear(p.x, p.y, spread, rad, pad, tries);
  /** Wahrzeichen nah am Ort */
  const landmark = (p: P2, k: string, w: number, h: number, spread = 260, o: Partial<Prop> = {}) => {
    const q = near(p, spread, Math.max(w, h) * 0.6, 55, 80);
    if (!q) return null;
    solid(q.x, q.y, w, h);
    prop(k, q.x, q.y, o);
    return q;
  };
  // Industrie: Schornsteine, Container (gestapelt), Silos, Kran, Kleinkram, Ölflecken
  {
    const sw = poi('Steel Works');
    plazas.push({ x: sw.x, y: sw.y, r: 700 });
    for (let i = 0; i < 3; i++) landmark(sw, 'chimney', 80, 80, 600);
    for (let i = 0; i < 3; i++) landmark(sw, 'silo', 110, 110, 650, { c: [0xd8dde3, 0xb9c1ca][i % 2] });
    // Containerhof mit Kran
    const yard = near(sw, 900, 400, 10, 300);
    if (yard) {
      blocks.push({ x: yard.x, y: yard.y, r: 490 });
      for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
        if (r() < 0.25) continue;
        // Gänge zwischen den Containern sind breit genug zum Durchlaufen (mind. 80)
        const x = yard.x - 360 + j * 240, y = yard.y - 150 + i * 150, lv = r() < 0.35 ? 2 : 1;
        obstacles.push({ kind: 'box', x, y, w: 160, h: 64, r: 0, hide: true });
        prop('container', x, y, { a: 0, c: CC[Math.floor(r() * CC.length)], h: lv, s: 1 });
      }
      prop('crane', yard.x, yard.y, { s: 1 });
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) obstacles.push({ kind: 'box', x: yard.x + sx * 400, y: yard.y + sy * 270, w: 34, h: 34, r: 0, hide: true });
    }
    const ir = region('industry');
    for (const k of ['pallet', 'pallet', 'drum', 'drum', 'forklift', 'barrier', 'barrier', 'pallet']) landmark(ir, k, k === 'forklift' ? 80 : 50, 50, ir.r * 0.8, { a: r() * 6 });
    for (let i = 0; i < 10; i++) { const q = near(ir, ir.r * 0.8, 30); if (q) prop('oil', q.x, q.y, { a: r() * 6, s: 0.7 + r() * 0.8 }); }
    for (let i = 0; i < 6; i++) { const q = near(ir, ir.r * 0.7, 120, 10); if (q) prop('yline', q.x, q.y, { a: r() < 0.5 ? 0 : Math.PI / 2, s: 1 }); }
  }
  // Hafen: Container, Boote am Steg, Fischerhütten, Kisten, Netze
  {
    const ph = poi('Port Haven');
    plazas.push({ x: ph.x, y: ph.y, r: 380 });
    for (let i = 0; i < 6; i++) {
      const qq = near(ph, 700, 95, 10, 60);
      if (!qq) continue;
      const x = qq.x, y = qq.y;
      obstacles.push({ kind: 'box', x, y, w: 160, h: 64, r: 0, hide: true });
      blocks.push({ x, y, r: 110 });
      prop('container', x, y, { a: 0, c: CC[Math.floor(r() * CC.length)], h: 1, s: 1 });
    }
    const p = PIERS[1], q = pierLocal(p, p.x2, p.y2);
    for (let i = 0; i < 3; i++) {
      const t = q.L * (0.45 + i * 0.2), side = i % 2 ? 1 : -1;
      prop('boat', p.x1 + q.ux * t - q.uy * side * (p.w / 2 + 70), p.y1 + q.uy * t + q.ux * side * (p.w / 2 + 70), { a: Math.atan2(q.uy, q.ux), c: [0xffffff, 0xe2574c, 0x3d8cf0][i] });
    }
    prop('pier', 0, 0, { s: 1 });
    for (let i = 0; i < 2; i++) landmark(ph, 'fishhut', 140, 120, 520, { a: r() * 6 });
    for (let i = 0; i < 4; i++) landmark(ph, 'crates', 60, 60, 500, { a: r() * 6 });
    for (let i = 0; i < 3; i++) { const qq = near(ph, 500, 30); if (qq) prop('nets', qq.x, qq.y, { a: r() * 6 }); }
  }
  // Orte: Häuser im passenden Stil
  village(poi('Frost Station'), 4, 300, 380, 460);
  village(region('snow'), 3, 250, 300, 900, 0.3);
  village(poi('Dusty Mesa'), 4, 280, 340, 420);
  village(poi('Windpump Ranch'), 2, 260, 300, 240, 0.8);
  village(poi('Rust Quarry'), 1, 280, 320, 300);
  village(poi('Steel Works'), 4, 380, 430, 800, 0, 'factory');
  village(poi('Signal Tower'), 1, 240, 280, 200);
  village(poi('Maple Village'), 5, 240, 300, 440, 0.5);
  // Tempel: großes japanisches Haus mit goldener Truhe, daneben kleinere Häuser
  {
    const p = poi('Blossom Temple');
    const tq = placeNear(p.x, p.y, 220, 330, 40, 80) ?? placeNear(p.x, p.y, 600, 330, 40, 80);
    if (tq) { blocks.push({ x: tq.x, y: tq.y, r: 340 }); addHouse(tq, 420, false, 'jp', true, true); }
  }
  village(poi('Blossom Temple'), 4, 260, 320, 520, 0.3);
  village(poi('Port Haven'), 4, 340, 400, 520);
  village(poi('Palm Beach'), 3, 220, 260, 400);
  village(poi('Cliffside'), 2, 240, 280, 300, 0.5);
  village(poi('Misty Falls'), 1, 240, 280, 260);
  village(poi('Ranger Tower'), 1, 220, 250, 200);
  village(poi('Water Tower'), 1, 230, 260, 200);
  village(poi('Timber Cabins'), 4, 230, 280, 360, 0.3);
  village(poi('Pinewood'), 3, 230, 270, 640, 0.3);
  village(poi('Sunny Farm'), 3, 320, 380, 380, 0.5);
  village(poi('Campsite'), 1, 220, 240, 220);
  // einzelne Höfe dazwischen
  for (let i = 0; i < 55; i++) { const s = 230 + Math.floor(r() * 60), fenced = r() < 0.4, rad = s * 0.72 + (fenced ? 80 : 0); const q = place(rad, 140, 150); if (q) { blocks.push({ x: q.x, y: q.y, r: rad }); addHouse(q, s, fenced); } }

  // ---------- Requisiten je Biom ----------
  // Türme: echte Modelle statt Säulen
  landmark(poi('Signal Tower'), 'signaltower', 90, 90);
  landmark(poi('Water Tower'), 'watertower', 110, 110);
  landmark(poi('Ranger Tower'), 'rangertower', 100, 100);
  landmark(poi('Windpump Ranch'), 'windpump', 70, 70);
  { const i = ISLETS[0]; solid(i.x, i.y, 110, 110, 30); prop('lighthouse', i.x, i.y); }

  // Schnee: Forschungsstation, Schneemänner, Holzstapel
  {
    const p = poi('Frost Station');
    for (let i = 0; i < 3; i++) landmark(p, 'dome', 170, 170, 420, { s: 0.8 + r() * 0.4 });
    landmark(p, 'antenna', 70, 70, 360);
    for (let i = 0; i < 3; i++) landmark(p, 'snowmobile', 90, 50, 900, { a: r() * 6, c: CC[Math.floor(r() * 3)] });
    const sr = region('snow');
    for (let i = 0; i < 6; i++) landmark(sr, 'snowman', 40, 40, sr.r * 0.8, { a: r() * 6 });
    for (let i = 0; i < 8; i++) landmark(sr, 'woodpile', 90, 40, sr.r * 0.85, { a: r() < 0.5 ? 0 : Math.PI / 2 });
  }
  // Wüste: Tafelberge, Westernkram, Steinbruch, Staubwirbel
  {
    const dr = region('desert');
    const dm = poi('Dusty Mesa');
    landmark(dm, 'tank', 110, 110, 380);
    landmark(dm, 'wagon', 130, 70, 500, { a: r() * 6 });
    for (let i = 0; i < 5; i++) { const q = near(dr, dr.r * 0.8, 30); if (q) prop('skull', q.x, q.y, { a: r() * 6 }); }
    for (let i = 0; i < 3; i++) { const q = near(dr, dr.r * 0.7, 30); if (q) prop('dustdevil', q.x, q.y, { a: r() * 6 }); }
    for (let i = 0; i < 18; i++) { const q = near(dr, dr.r * 0.9, 30); if (q) prop('drybush', q.x, q.y, { a: r() * 6, s: 0.7 + r() * 0.6 }); }
    const rq = poi('Rust Quarry');
    prop('quarrypit', rq.x, rq.y, { s: 420 });
    landmark(rq, 'excavator', 160, 110, 300, { a: r() * 6 });
    landmark(rq, 'conveyor', 300, 50, 350, { a: r() * 6 });
    for (let i = 0; i < 3; i++) landmark(rq, 'minecart', 60, 50, 420, { a: 0.3 });
    for (let i = 0; i < 10; i++) { const rad = ROCK_SIZES[Math.floor(r() * 3)]; const q = near(rq, 480, rad + 30, 30); if (q) { blocks.push({ x: q.x, y: q.y, r: rad + 30 }); obstacles.push({ kind: 'rock', x: q.x, y: q.y, r: rad, w: rad * 2, h: rad * 2 }); } }
  }
  // Kirschblüten: Pagode, Torii-Tore entlang der Straße, Bambus, Zen-Garten, Laternen
  {
    const bt = poi('Blossom Temple');
    landmark(bt, 'pagoda', 190, 190, 520);
    const rd = roads[3];
    for (let i = 1; i <= 4; i++) {
      const t = 0.55 + i * 0.1, a = rd.pts[rd.pts.length - 2], b = rd.pts[rd.pts.length - 1];
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, ang = Math.atan2(b.y - a.y, b.x - a.x);
      // Pfosten links und rechts neben der Straße (Straße bleibt frei)
      prop('torii', x, y, { a: ang });
      for (const sd of [-1, 1]) obstacles.push({ kind: 'box', x: x - Math.sin(ang) * sd * 92, y: y + Math.cos(ang) * sd * 92, w: 22, h: 22, r: 0, hide: true });
    }
    const gr = region('grove');
    for (let i = 0; i < 4; i++) {
      const q = near(gr, gr.r * 0.8, 150, 40);
      if (!q) continue;
      blocks.push({ x: q.x, y: q.y, r: 150 });
      for (let k = 0; k < 9; k++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * 110, x = q.x + Math.cos(a) * d, y = q.y + Math.sin(a) * d;
        if (props.some((o) => o.k === 'bamboo' && Math.hypot(o.x - x, o.y - y) < 80)) continue;
        prop('bamboo', x, y, { s: 0.8 + r() * 0.5 });
        obstacles.push({ kind: 'box', x, y, w: 26, h: 26, r: 0, hide: true });
      }
    }
    landmark(bt, 'zen', 260, 180, 600, { a: 0 });
    for (let i = 0; i < 6; i++) { const q = near(gr, gr.r * 0.8, 30); if (q) prop('stonelantern', q.x, q.y, { a: r() * 6 }); }
  }
  // Strände: Palmen kommen aus den Bäumen, dazu Schirme, Liegen und eine Strandbar
  {
    const pb = poi('Palm Beach');
    landmark(pb, 'beachbar', 180, 130, 300, { a: r() * 6 });
    for (const b of regions.filter((g) => g.kind === 'beach')) {
      for (let i = 0; i < 7; i++) {
        const q = near(b, b.r * 0.8, 60, 30);
        if (!q) continue;
        blocks.push({ x: q.x, y: q.y, r: 60 });
        prop('umbrella', q.x, q.y, { c: CC[Math.floor(r() * CC.length)], a: r() * 6 });
        prop('lounger', q.x + 50, q.y + 30, { a: r() * 0.6 - 0.3 });
      }
    }
    for (let i = 0; i < 14; i++) {
      const a = r() * 6.28, R = landRadius(a) - 110, x = ISLAND.x + Math.cos(a) * R, y = ISLAND.y + Math.sin(a) * R;
      if (fits(x, y, 20, 10)) prop(r() < 0.5 ? 'shell' : 'driftwood', x, y, { a: r() * 6 });
    }
  }
  // Klippen bei Cliffside: große Felsen an der Küste, Möwen darüber
  {
    const cs = poi('Cliffside'), a0 = Math.atan2(cs.y - ISLAND.y, cs.x - ISLAND.x);
    for (let i = -4; i <= 4; i++) {
      const a = a0 + i * 0.035, R = landRadius(a) - 150, x = ISLAND.x + Math.cos(a) * R, y = ISLAND.y + Math.sin(a) * R, rad = 70 + r() * 40;
      if (!fits(x, y, rad, 10)) continue;
      blocks.push({ x, y, r: rad + 50 });
      obstacles.push({ kind: 'rock', x, y, r: rad, w: rad * 2, h: rad * 2, hide: true });
      prop('cliffrock', x, y, { s: rad / 80, a: r() * 6 });
    }
    prop('gulls', cs.x, cs.y, { s: 1 });
    prop('gulls', ISLETS[0].x, ISLETS[0].y, { s: 0.8 });
  }
  // Farm: Silo, Windrad, Rundballen
  {
    const sf = poi('Sunny Farm');
    landmark(sf, 'silo_farm', 110, 110, 420);
    landmark(sf, 'windmill', 120, 120, 600);
    for (let i = 0; i < 6; i++) landmark(region('farm'), 'roundbale', 60, 60, region('farm').r * 0.8, { a: r() * 6 });
  }
  // Wald: Wasserfall bei Misty Falls, Lagerfeuer, Baumstümpfe, Stämme, Pilze
  {
    const cp = poi('Campsite');
    const fire = near(cp, 160, 40, 20, 60);
    if (fire) { prop('campfire', fire.x, fire.y); obstacles.push({ kind: 'box', x: fire.x, y: fire.y, w: 50, h: 50, r: 0, hide: true }); blocks.push({ x: fire.x, y: fire.y, r: 120 }); }
    for (const c of [0xffc93c, 0xff8a2e, 0x3d8cf0, 0x43c463]) landmark(cp, 'tent', 90, 80, 450, { c, a: r() * 6 });
    const fr = region('forest');
    for (let i = 0; i < 26; i++) {
      const q = near(fr, fr.r * 0.95, 40, 20);
      if (!q) continue;
      const v = r();
      if (v < 0.35) prop('stump', q.x, q.y, { a: r() * 6 });
      else if (v < 0.55) { prop('log', q.x, q.y, { a: r() * 6 }); }
      else if (v < 0.8) prop('mushroom', q.x, q.y, { a: r() * 6 });
      else prop('fern', q.x, q.y, { a: r() * 6, s: 0.8 + r() * 0.5 });
    }
  }
  // Old Town: Laternen, Hydranten, Mülleimer, Blumenkübel und ein paar geparkte Autos an den Stadtstraßen
  {
    const cityRoads = roads.filter((rd) => rd.w === 100);
    let cars = 0;
    for (const rd of cityRoads) {
      const a = rd.pts[0], b = rd.pts[1], L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
      for (let t = 260; t < L - 200; t += 300) {
        const side = (t / 300) % 2 < 1 ? 1 : -1, off = rd.w / 2 + 58;
        const x = a.x + ux * t - uy * side * off, y = a.y + uy * t + ux * side * off;
        if (!fits(x, y, 20, 5)) continue;
        const v = r();
        const k = v < 0.45 ? 'lamp' : v < 0.6 ? 'hydrant' : v < 0.75 ? 'bin' : 'planter';
        prop(k, x, y, { a: Math.atan2(uy, ux) });
        if (cars < 6 && r() < 0.6) {
          const cx = a.x + ux * (t + 130) - uy * side * (rd.w / 2 + 110), cy = a.y + uy * (t + 130) + ux * side * (rd.w / 2 + 110);
          if (fits(cx, cy, 70, 20)) {
            const ang = Math.atan2(uy, ux);
            const horiz = Math.abs(ux) > Math.abs(uy);
            solid(cx, cy, horiz ? 130 : 64, horiz ? 64 : 130, 10);
            prop('car', cx, cy, { a: ang, c: [0xe2574c, 0x3d8cf0, 0xf2f2f2, 0xf2b233, 0x43c463][Math.floor(r() * 5)] });
            cars++;
          }
        }
      }
    }
  }
  // Strommasten entlang einiger Landstraßen
  {
    for (const idx of [4, 5, 6]) {
      const rd = roads[idx], line: P2[] = [];
      for (let i = 0; i < rd.pts.length - 1; i++) {
        const a = rd.pts[i], b = rd.pts[i + 1], L = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
        for (let t = i === 0 ? 120 : 0; t < L; t += 420) {
          const x = a.x + ux * t - uy * (rd.w / 2 + 60), y = a.y + uy * t + ux * (rd.w / 2 + 60);
          if (fits(x, y, 14, 4)) line.push({ x, y });
        }
      }
      for (let i = 0; i < line.length; i++) prop('pole', line[i].x, line[i].y, { a: i + 1 < line.length ? Math.atan2(line[i + 1].y - line[i].y, line[i + 1].x - line[i].x) : 0, h: i + 1 < line.length ? 1 : 0 });
    }
  }
  // Deckung zwischen den Orten: niedrige Steinmauern und Heuballen (sparsam)
  for (let i = 0; i < 26; i++) {
    const q = place(110, 160, 40);
    if (!q || regionAt(q.x, q.y, 1.1)) continue;
    const ang = r() < 0.5 ? 0 : Math.PI / 2, horiz = ang === 0;
    solid(q.x, q.y, horiz ? 180 : 36, horiz ? 36 : 180, 40);
    prop('lowwall', q.x, q.y, { a: ang });
  }

  const grass: Area[] = [];
  // ---------- Bäume: Art je Biom (Tanne, Kaktus, Palme, Kirsche, Laubbaum) ----------
  forests.push({ ...poi('Pinewood'), r: 1600 }, { ...region('grove'), r: 1300 }, { ...region('snow'), r: 1500 });
  const addTree = (q: P2 | null) => {
    if (!q) return;
    const g = regionAt(q.x, q.y);
    if (g === 'industry' || g === 'city') return;
    if ((g === 'desert' || g === 'beach') && r() < 0.6) return;
    blocks.push({ x: q.x, y: q.y, r: 34 });
    obstacles.push({ kind: 'tree', x: q.x, y: q.y, r: 14, w: 28, h: 28 });
  };
  for (let i = 0; i < 380; i++) addTree(placeNear(forests[0].x, forests[0].y, forests[0].r, 34, 14));
  for (let i = 0; i < 170; i++) addTree(placeNear(forests[1].x, forests[1].y, forests[1].r, 34, 20));
  for (let i = 0; i < 170; i++) addTree(placeNear(forests[2].x, forests[2].y, forests[2].r, 34, 20));
  for (let i = 0; i < 560; i++) addTree(place(34, 10));
  // Kakteen in der Wüste, Palmen an den Stränden
  { const dr = region('desert'); for (let i = 0; i < 45; i++) addTree(placeNear(dr.x, dr.y, dr.r, 34, 60)); }
  for (const b of regions.filter((g) => g.kind === 'beach')) for (let i = 0; i < 40; i++) addTree(placeNear(b.x, b.y, b.r, 34, 40));

  // ---------- Felsen ----------
  const addRock = (rad: number, q: P2 | null) => {
    if (!q || regionAt(q.x, q.y) === 'city') return;
    blocks.push({ x: q.x, y: q.y, r: rad + 30 });
    obstacles.push({ kind: 'rock', x: q.x, y: q.y, r: rad, w: rad * 2, h: rad * 2 });
  };
  const mesa = region('desert');
  for (let i = 0; i < 60; i++) { const rad = ROCK_SIZES[Math.floor(r() * 3)]; addRock(rad, placeNear(mesa.x, mesa.y, mesa.r, rad + 30, 30)); }
  for (let i = 0; i < 230; i++) { const rad = ROCK_SIZES[Math.floor(r() * 3)]; addRock(rad, place(rad + 30)); }

  // ---------- Büsche, Fässer, Loot ----------
  for (let i = 0; i < 380; i++) {
    const f = forests[i % forests.length];
    const q = i < 110 ? placeNear(f.x, f.y, f.r, 38, 16) : place(38, 20);
    if (!q || regionAt(q.x, q.y) === 'desert' || regionAt(q.x, q.y) === 'snow') continue;
    blocks.push({ x: q.x, y: q.y, r: 38 });
    obstacles.push({ kind: 'bush', x: q.x, y: q.y, r: 42, w: 84, h: 84 });
  }
  for (let i = 0; i < 90; i++) {
    const q = place(50, 30);
    if (!q || regionAt(q.x, q.y) === 'city') continue;
    blocks.push({ x: q.x, y: q.y, r: 50 });
    obstacles.push({ kind: 'barrel', x: q.x, y: q.y, r: 17, w: 34, h: 34 });
  }
  // Blumen (kleine 3D-Deko statt Punkten im Boden): nur auf Gras
  for (let i = 0; i < 4000; i++) {
    const x = r() * WORLD, y = r() * WORLD;
    if (!isMainLand(x, y, BEACH_W + 40)) continue;
    const g = regionAt(x, y);
    if (g && g !== 'farm' && g !== 'forest' && g !== 'grove') continue;
    if (blocks.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < (b.r + 10) ** 2)) continue;
    prop('flower', x, y, { c: g === 'grove' ? 0xff9ec8 : [0xffffff, 0xffe066, 0xff8fb1, 0xb18cff][Math.floor(r() * 4)], a: r() * 6 });
  }
  for (let i = 0; i < 720; i++) { const q = place(14, 8); if (q) addLoot(q.x, q.y); }
  // Loot auf der Leuchtturm-Insel und am Hafensteg
  { const i = ISLETS[0]; for (const a of [0.5, 2.6, 4.4]) addLoot(i.x + Math.cos(a) * 130, i.y + Math.sin(a) * 130); }
  { const p = PIERS[1]; addLoot(p.x1 + (p.x2 - p.x1) * 0.8, p.y1 + (p.y2 - p.y1) * 0.8); }

  // ---------- Erdwege von Häusern abseits der Straßen zur nächsten Straße ----------
  const rectGap = (h: House, x: number, y: number) => Math.hypot(Math.max(0, Math.abs(x - h.x) - h.s / 2), Math.max(0, Math.abs(y - h.y) - h.s / 2));
  for (const h of houses) {
    if (h.style === 'hall' || h.style === 'shop' || regionAt(h.x, h.y) === 'city') continue;
    // für jede Tür die nächste Straße suchen; nur Wege, die von der Tür weg führen und kein Haus schneiden
    let bestPath: { a: P2; b: P2; len: number } | null = null;
    for (const d0 of h.doors) {
      const a = { x: d0.x + d0.nx * 40, y: d0.y + d0.ny * 40 };
      let best: (typeof roadSamples)[0] | null = null, bd = Infinity;
      for (const q of roadSamples) { const e = Math.hypot(q.x - a.x, q.y - a.y); if (e < bd) { bd = e; best = q; } }
      if (!best || bd > 900) continue;
      if (bd < best.w / 2 + 60) { bestPath = null; break; }
      const b = { x: best.x, y: best.y };
      if ((b.x - a.x) * d0.nx + (b.y - a.y) * d0.ny < bd * 0.35) continue;
      let bad = false;
      for (let i = 0; i < pts.length - 1 && !bad; i++) if (segsCross(a, b, pts[i], pts[i + 1])) bad = true;
      const n = Math.ceil(bd / 20);
      for (let k = 1; k <= n && !bad; k++) {
        const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
        for (const o of houses) if (rectGap(o, x, y) < 40) { bad = true; break; }
      }
      if (!bad && (!bestPath || bd < bestPath.len)) bestPath = { a, b, len: bd };
    }
    if (bestPath) roads.push({ pts: [bestPath.a, bestPath.b], w: 56, dirt: true });
  }

  return { obstacles, lootSpots: loot, houses, forests, ponds, fields, town, river, grass, pois, roads, ring, regions, props, plazas };
}
