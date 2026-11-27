import { WeaponLoot, wKind, rollRarity, GROUND_RARITY } from './weapons';
import { WORLD } from './config';
import { mulberry32 } from './rng';

export type ObsKind = 'tree' | 'rock' | 'crate' | 'chest' | 'airdrop' | 'wall' | 'bush' | 'water' | 'fence' | 'barrel' | 'hay' | 'box';
export interface Obs { kind: ObsKind; x: number; y: number; r: number; w: number; h: number; /** Farbe und Höhe (nur 'box': Container, Zelte, Türme) */ c?: number; tall?: number }
export type LootKind = 'ammo' | 'ammo6' | 'armor' | 'medkit' | 'bigmed' | WeaponLoot;
export interface LootSpawn { x: number; y: number; kind: LootKind }
export interface Door { x: number; y: number; nx: number; ny: number }
export interface House { x: number; y: number; s: number; doors: Door[] }
export interface Area { x: number; y: number; r: number }
export interface Field { x: number; y: number; w: number; h: number }
export interface MapData {
  seed: number;
  obstacles: Obs[];
  loot: LootSpawn[];
  houses: House[];
  forests: Area[];
  ponds: Area[];
  fields: Field[];
  town: Area;
  /** Fluss als Linienzug mit Breite, Brücken mit Mittelpunkt und Richtung des Flusses */
  river: { pts: { x: number; y: number }[]; width: number; bridges: { x: number; y: number; angle: number }[]; water: { x: number; y: number }[] };
  /** hohe Grasfelder: darin ist man unsichtbar */
  grass: Area[];
  /** benannte Orte */
  pois: Poi[];
  /** Straßen (nur Optik): Linienzüge, plus Ringstraße um die Stadt */
  roads: { pts: { x: number; y: number }[]; w: number }[];
  ring: { x: number; y: number; r: number; w: number };
  /** Regionen mit eigenem Boden und eigener Vegetation */
  regions: Region[];
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
/** liegt der Punkt auf der Insel (mit Abstand pad zur Küste)? */
export function isLand(x: number, y: number, pad = 0) {
  const dx = x - ISLAND.x, dy = y - ISLAND.y;
  return Math.hypot(dx, dy) < landRadius(Math.atan2(dy, dx)) - pad;
}
/** Küstenlinie als Polygon (n Punkte, im Uhrzeigersinn ab Osten) */
export function coastPolygon(n = 240, inset = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, r = landRadius(a) - inset;
    return { x: ISLAND.x + Math.cos(a) * r, y: ISLAND.y + Math.sin(a) * r };
  });
}
/** Breite des Sandstrands an der Küste */
export const BEACH_W = 190;

export const ROCK_SIZES = [28, 38, 48];
/** Radius der unsichtbaren Geländer-Kollision an Brücken */
export const RAIL_R = 12;
/** Dorfplatz (frei von Häusern) und Brunnen (Kollision) */
export const PLAZA_R = 300;
export const FOUNTAIN_R = 46;

export function randomLootKind(r: () => number): LootKind {
  // Verteilung: Munition 50 %, Waffen 22 %, Heilung 18 %, Schild 10 %
  const v = r();
  if (v < 0.27) {
    const w = r();
    // mehr Pistolen, weil alle ohne Waffe starten
    return wKind(w < 0.32 ? 'pistol' : w < 0.56 ? 'smg' : w < 0.74 ? 'shotgun' : w < 0.92 ? 'rifle' : 'sniper', rollRarity(r, GROUND_RARITY));
  }
  // Munition: meist 3er-Packung, seltener die 6er-Packung
  if (v < 0.72) return r() < 0.22 ? 'ammo6' : 'ammo';
  if (v < 0.82) return 'armor';
  return v < 0.95 ? 'medkit' : 'bigmed';
}

/** feste Karte: Aufbau ist immer gleich, nur welche Gegenstände wo liegen, wechselt pro Runde */
export const LAYOUT_SEED = 20261127;
export function generateMap(seed: number): MapData {
  const r = mulberry32(LAYOUT_SEED);
  const rl = mulberry32(seed);
  const obstacles: Obs[] = [];
  const loot: LootSpawn[] = [];
  const houses: House[] = [];
  const forests: Area[] = [];
  const ponds: Area[] = [];
  const fields: Field[] = [];
  const blocks: { x: number; y: number; r: number }[] = [];
  const P = (x: number, y: number) => ({ x: x * K, y: y * K });

  const fits = (x: number, y: number, rad: number, pad: number) => {
    if (!isLand(x, y, rad + 60)) return false;
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
  /** Loot mit Mindestabstand: am Anfang liegt nichts übereinander */
  const LOOT_GAP = 80;
  const addLoot = (x: number, y: number, kind: LootKind) => {
    if (!isLand(x, y, 40)) return false;
    for (const l of loot) if ((l.x - x) ** 2 + (l.y - y) ** 2 < LOOT_GAP * LOOT_GAP) return false;
    for (const o of obstacles) {
      if ((o.kind === 'wall' || o.kind === 'box') && Math.abs(o.x - x) < o.w / 2 + 30 && Math.abs(o.y - y) < o.h / 2 + 30) return false;
      if (o.kind === 'water' && Math.hypot(o.x - x, o.y - y) < o.r + 30) return false;
      if (o.kind !== 'chest' && o.kind !== 'crate') continue;
      if (Math.abs(o.x - x) < o.w / 2 + 40 && Math.abs(o.y - y) < o.h / 2 + 40) return false;
    }
    loot.push({ x, y, kind });
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
  /** Punkt auf die Insel ziehen (Richtung Mitte), falls er im Meer liegt */
  const onLand = (p: { x: number; y: number }, pad: number) => {
    let { x, y } = p;
    for (let i = 0; i < 60 && !isLand(x, y, pad); i++) { x += (ISLAND.x - x) * 0.04; y += (ISLAND.y - y) * 0.04; }
    return { x, y };
  };

  // ---------- Orte und Regionen (aus der Mock-Karte) ----------
  const poiDefs: [string, number, number, number, boolean][] = [
    ['Old Town', 1215, 990, 330, true], ['Pinewood', 440, 600, 300, true], ['Frost Station', 1170, 340, 200, true],
    ['Dusty Mesa', 1820, 470, 230, true], ['Steel Works', 1980, 1010, 200, true], ['Blossom Temple', 1880, 1690, 220, true],
    ['Sunny Farm', 560, 1420, 230, true], ['Port Haven', 1200, 1960, 200, true],
    ['Ranger Tower', 470, 440, 70, false], ['Campsite', 340, 790, 80, false], ['Timber Cabins', 690, 640, 90, false],
    ['Misty Falls', 330, 1040, 80, false], ['Water Tower', 650, 470, 60, false], ['Windpump Ranch', 1660, 340, 90, false],
    ['Rust Quarry', 1990, 700, 120, false], ['Signal Tower', 1700, 1240, 70, false], ['Maple Village', 1870, 1330, 140, false],
    ['Palm Beach', 520, 1860, 160, false], ['Cliffside', 340, 1630, 110, false], ['Lighthouse', 1560, 2050, 70, false],
  ];
  const pois: Poi[] = poiDefs.map(([name, x, y, rr, big]) => { const q = onLand(P(x, y), big ? 500 : 320); return { name, x: q.x, y: q.y, r: rr * K, big }; });
  const poi = (n: string) => pois.find((q) => q.name === n)!;
  const regions: Region[] = [
    { kind: 'snow', ...P(1150, 300), r: 470 * K }, { kind: 'desert', ...P(1900, 470), r: 470 * K }, { kind: 'forest', ...P(440, 560), r: 460 * K },
    { kind: 'grove', ...P(1900, 1650), r: 420 * K }, { kind: 'beach', ...P(1020, 2020), r: 420 * K }, { kind: 'beach', ...P(430, 1880), r: 300 * K },
    { kind: 'farm', ...P(560, 1450), r: 260 * K }, { kind: 'industry', ...P(1990, 1030), r: 260 * K }, { kind: 'city', ...P(1215, 990), r: 330 * K },
  ];
  const regionAt = (x: number, y: number): RegionKind | null => {
    let best: RegionKind | null = null, bd = Infinity;
    for (const g of regions) { const d = Math.hypot(g.x - x, g.y - y) / g.r; if (d < 1 && d < bd) { bd = d; best = g.kind; } }
    return best;
  };

  // ---------- Straßen ----------
  const C = poi('Old Town');
  const RING_R = 1500;
  const ring = { x: C.x, y: C.y, r: RING_R, w: 120 };
  const roadDefs: number[][][] = [
    [[1215, 630], [1215, 560], [1060, 520], [960, 420]],
    [[1575, 990], [1700, 990], [1780, 880], [1820, 700], [1880, 560], [1820, 470]],
    [[1555, 1110], [1720, 1080], [1880, 1060], [1980, 1010]],
    [[855, 990], [700, 990], [560, 900], [460, 760], [500, 620]],
    [[955, 1240], [820, 1330], [640, 1360], [560, 1600], [520, 1800]],
    [[1215, 1350], [1215, 1520], [1190, 1720], [1200, 1880]],
    [[1465, 1250], [1580, 1350], [1700, 1460], [1840, 1600]],
    [[640, 1360], [760, 1560], [1020, 1640], [1190, 1720]],
    [[1580, 1350], [1700, 1260], [1870, 1330], [2000, 1260]],
    [[1060, 520], [1300, 540], [1500, 460], [1660, 360]],
    [[1820, 700], [1990, 700]],
    [[460, 760], [340, 790]],
    [[560, 1600], [340, 1630]],
    [[1840, 1600], [1880, 1690]],
    [[1700, 1460], [1560, 2000]],
  ];
  const roads = roadDefs.map((pts) => ({ pts: pts.map(([x, y]) => onLand(P(x, y), 200)), w: 120 }));
  // Straßen, die an der Stadt beginnen, starten genau an der Ringstraße
  for (const rd of roads) {
    const a = rd.pts[0], d = Math.hypot(a.x - C.x, a.y - C.y);
    if (d < RING_R) rd.pts[0] = { x: C.x + (a.x - C.x) / d * RING_R, y: C.y + (a.y - C.y) / d * RING_R };
  }
  // Innenstraßen der Stadt (Kreuz)
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) roads.push({ pts: [{ x: C.x + Math.cos(a) * 400, y: C.y + Math.sin(a) * 400 }, { x: C.x + Math.cos(a) * RING_R, y: C.y + Math.sin(a) * RING_R }], w: 100 });
  const roadSamples: { x: number; y: number; w: number }[] = [];
  for (const rd of roads) for (let i = 0; i < rd.pts.length - 1; i++) {
    const a = rd.pts[i], b = rd.pts[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 60);
    for (let k = 0; k <= n; k++) roadSamples.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n, w: rd.w });
  }
  for (let i = 0; i < 120; i++) { const a = i / 120 * Math.PI * 2; roadSamples.push({ x: C.x + Math.cos(a) * RING_R, y: C.y + Math.sin(a) * RING_R, w: ring.w }); }

  // ---------- Fluss: vom Wasserfall an der Westklippe um die Stadt herum zum Meer im Süden ----------
  const RIVER_W = 200;
  const pts = [[150, 1010], [300, 1030], [420, 1060], [560, 960], [660, 1000], [700, 1180], [790, 1380], [940, 1520], [1080, 1560], [1110, 1700], [980, 1850], [900, 2000], [880, 2300]].map(([x, y]) => P(x, y));
  const samples: { x: number; y: number; a: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(len / 50);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) });
    }
  }
  // Brücken dort, wo Straßen den Fluss kreuzen
  const bridges: { x: number; y: number; angle: number }[] = [];
  for (const sp of samples) {
    if (!isLand(sp.x, sp.y, 300)) continue;
    const hit = roadSamples.some((q) => q.w >= 120 && Math.hypot(q.x - sp.x, q.y - sp.y) < 45);
    if (hit && bridges.every((b) => Math.hypot(b.x - sp.x, b.y - sp.y) > 900)) bridges.push({ x: sp.x, y: sp.y, angle: sp.a });
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
  // Straßen frei halten
  for (const q of roadSamples) blocks.push({ x: q.x, y: q.y, r: q.w / 2 + 20 });

  // ---------- Teiche ----------
  for (const [x, y, rr] of [[900, 560, 62], [2050, 1820, 60], [1500, 760, 50]] as const) {
    const q = P(x, y), rad = rr * K;
    if (!fits(q.x, q.y, rad + 40, 40)) continue;
    blocks.push({ x: q.x, y: q.y, r: rad + 50 });
    ponds.push({ x: q.x, y: q.y, r: rad });
    obstacles.push({ kind: 'water', x: q.x, y: q.y, r: rad, w: rad * 2, h: rad * 2 });
  }

  // ---------- Stadtzentrum mit Brunnen ----------
  const town: Area = { x: C.x, y: C.y, r: RING_R };
  blocks.push({ x: town.x, y: town.y, r: PLAZA_R });
  obstacles.push({ kind: 'water', x: town.x, y: town.y, r: FOUNTAIN_R, w: FOUNTAIN_R * 2, h: FOUNTAIN_R * 2 });

  const addHouse = (p: { x: number; y: number }, s: number, fenced: boolean) => {
    const house: House = { x: p.x, y: p.y, s, doors: [] };
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
    const isDoor = (side: number) => side === doorA || side === doorB;
    // Türpositionen mit Richtung nach draußen (für den Lichtschein)
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
    // größere Häuser: Innenwand mit Durchgang (zwei Räume)
    if (s > 290 && r() < 0.75) {
      const gap = 92, clear = 115;
      // Die Innenwand darf nie vor einer Tür enden: an Wänden mit Tür bleibt vorne frei Platz
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
    // Truhen gibt es nur in Häusern: meist eine, in großen Häusern manchmal zwei
    // schmalere Loot-Kisten
    const chestAt = (cx: number, cy: number) => obstacles.push({ kind: 'chest', x: cx, y: cy, r: 22, w: 48, h: 28 });
    if (r() < 0.75) chestAt(p.x - h + t + 36, p.y - h + t + 30);
    if (s > 320 && r() < 0.6) chestAt(p.x + h - t - 36, p.y + h - t - 30);
    const n = 1 + Math.floor(r() * 2) + (s > 330 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 12; tries++) {
        if (addLoot(p.x + (r() - 0.5) * (s - 150), p.y + (r() - 0.5) * (s - 150), randomLootKind(rl))) break;
      }
    }

    // Zaun um den Hof (mit Lücken)
    if (fenced) {
      const d = h + 70, ft = 10, gap = 100;
      const fenceH = (y: number) => {
        obstacles.push({ kind: 'fence', x: (p.x - d + p.x - gap / 2) / 2, y, w: d - gap / 2, h: ft, r: 0 });
        obstacles.push({ kind: 'fence', x: (p.x + gap / 2 + p.x + d) / 2, y, w: d - gap / 2, h: ft, r: 0 });
      };
      // seitlicher Zaun mit Lücke in der Mitte (vor einer möglichen Seitentür)
      const fenceV = (x: number) => {
        obstacles.push({ kind: 'fence', x, y: (p.y - d + p.y - gap / 2) / 2, w: ft, h: d - gap / 2, r: 0 });
        obstacles.push({ kind: 'fence', x, y: (p.y + gap / 2 + p.y + d) / 2, w: ft, h: d - gap / 2, r: 0 });
      };
      fenceH(p.y - d);
      fenceH(p.y + d);
      if (r() < 0.5) fenceV(p.x - d); else fenceV(p.x + d);
    }
    // Fässer neben dem Haus
    if (r() < 0.55) {
      const side = r() < 0.5 ? -1 : 1;
      // Fässer neben der Seitenwand, aber nie vor der Tür in der Wandmitte
      const bx = p.x + side * (h + 34), by = p.y + (r() < 0.5 ? -1 : 1) * (90 + r() * Math.max(10, s * 0.3 - 90)) - 19;
      obstacles.push({ kind: 'barrel', x: bx, y: by, r: 17, w: 34, h: 34 });
      if (r() < 0.6) obstacles.push({ kind: 'barrel', x: bx, y: by + 38, r: 17, w: 34, h: 34 });
      // Platz um die Fässer frei halten (kein Baum oder Fels direkt daneben)
      blocks.push({ x: bx, y: by + 19, r: 80 });
    }
  };


  const box = (x: number, y: number, w: number, h: number, c: number, tall: number) => { obstacles.push({ kind: 'box', x, y, w, h, r: 0, c, tall }); blocks.push({ x, y, r: Math.max(w, h) * 0.6 + 20 }); };
  /** n Häuser rund um einen Ort */
  const village = (p: Poi, n: number, sMin: number, sMax: number, spread: number, fencedChance = 0.3) => {
    let made = 0;
    for (let i = 0; i < n * 4 && made < n; i++) {
      const s = sMin + Math.floor(r() * (sMax - sMin));
      const fenced = r() < fencedChance;
      const rad = s * 0.72 + (fenced ? 80 : 0);
      const q = placeNear(p.x, p.y, spread * 1.7 + 200, rad, 40, 40);
      if (!q) continue;
      blocks.push({ x: q.x, y: q.y, r: rad });
      addHouse(q, s, fenced);
      made++;
    }
  };

  // Old Town: Häuser zwischen Marktplatz und Ringstraße, Rathaus im Norden
  {
    const hall = { x: C.x, y: C.y - 720 };
    if (fits(hall.x, hall.y, 300, 20)) { blocks.push({ x: hall.x, y: hall.y, r: 300 }); addHouse(hall, 420, false); }
    let made = 0;
    for (let i = 0; i < 800 && made < 18; i++) {
      const a = r() * Math.PI * 2, d = 540 + r() * (RING_R - 820);
      const x = C.x + Math.cos(a) * d, y = C.y + Math.sin(a) * d, s = 240 + Math.floor(r() * 80);
      if (!fits(x, y, s * 0.72, 30)) continue;
      blocks.push({ x, y, r: s * 0.72 });
      addHouse({ x, y }, s, false);
      made++;
    }
    // Bäume rund um den Marktplatz
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; obstacles.push({ kind: 'tree', x: C.x + Math.cos(a) * 250, y: C.y + Math.sin(a) * 250, r: 14, w: 28, h: 28 }); }
  }
  // ---------- Felder (Sunny Farm) ----------
  {
    const p = poi('Sunny Farm');
    for (const [dx, dy, w, h] of [[-300, 200, 480, 360], [240, 220, 400, 380], [-120, 560, 560, 260], [380, 600, 360, 280]]) {
      const x = p.x + dx, y = p.y + dy;
      if (!fits(x, y, Math.max(w, h) * 0.55, 20)) continue;
      blocks.push({ x, y, r: Math.max(w, h) * 0.6 });
      fields.push({ x, y, w, h });
      for (let k = 0; k < 5; k++) {
        const hx = x + (r() - 0.5) * (w - 120), hy = y + (r() - 0.5) * (h - 100);
        if (obstacles.some((o) => o.kind === 'hay' && Math.hypot(o.x - hx, o.y - hy) < 110)) continue;
        obstacles.push({ kind: 'hay', x: hx, y: hy, r: 0, w: 72, h: 48 });
      }
      addLoot(x, y, randomLootKind(rl));
    }
  }

  village(poi('Frost Station'), 3, 300, 380, 420);
  village(poi('Dusty Mesa'), 2, 300, 360, 450);
  village(poi('Windpump Ranch'), 1, 260, 300, 200, 0.8);
  village(poi('Rust Quarry'), 1, 280, 320, 300);
  village(poi('Steel Works'), 3, 400, 440, 520);
  village(poi('Signal Tower'), 1, 240, 280, 200);
  village(poi('Maple Village'), 4, 240, 300, 420, 0.5);
  village(poi('Blossom Temple'), 1, 380, 400, 200);
  village(poi('Port Haven'), 3, 360, 420, 520);
  village(poi('Palm Beach'), 2, 220, 260, 380);
  village(poi('Cliffside'), 2, 240, 280, 300, 0.5);
  village(poi('Lighthouse'), 1, 240, 260, 200);
  village(poi('Misty Falls'), 1, 240, 280, 260);
  village(poi('Ranger Tower'), 1, 220, 250, 200);
  village(poi('Water Tower'), 1, 230, 260, 200);
  village(poi('Timber Cabins'), 3, 230, 280, 320, 0.3);
  village(poi('Pinewood'), 2, 230, 270, 600, 0.3);
  // einzelne Höfe dazwischen
  for (let i = 0; i < 45; i++) { const s = 230 + Math.floor(r() * 60), fenced = r() < 0.4, rad = s * 0.72 + (fenced ? 80 : 0); const q = place(rad, 120, 150); if (q) { blocks.push({ x: q.x, y: q.y, r: rad }); addHouse(q, s, fenced); } }

  // ---------- Requisiten an den Orten ----------
  const CC = [0xe2574c, 0x3d8cf0, 0xf2b233, 0x43c463, 0x9b6bff];
  const containerYard = (p: Poi, rows: number, cols: number, ox: number, oy: number) => {
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      if (r() < 0.2) continue;
      const x = p.x + ox + j * 190, y = p.y + oy + i * 120;
      if (fits(x, y, 70, 10)) box(x, y, 150, 60, CC[Math.floor(r() * CC.length)], 120);
    }
  };
  containerYard(poi('Steel Works'), 3, 4, -360, 260);
  containerYard(poi('Port Haven'), 2, 5, -460, -320);
  // Türme (hohe schmale Bauten)
  for (const [n, c, tall] of [['Signal Tower', 0xe2574c, 420], ['Water Tower', 0xd04a3a, 360], ['Ranger Tower', 0xb0743c, 320], ['Lighthouse', 0xffffff, 460], ['Windpump Ranch', 0xffc93c, 340]] as const) {
    const p = poi(n);
    for (let i = 0; i < 20; i++) { const x = p.x + (r() - 0.5) * 260, y = p.y + (r() - 0.5) * 260; if (fits(x, y, 60, 10)) { box(x, y, 70, 70, c, tall); break; } }
  }
  // Zeltplatz
  { const p = poi('Campsite'); for (const c of [0xffc93c, 0xff8a2e, 0x3d8cf0]) { const q = placeNear(p.x, p.y, 200, 50, 20); if (q) box(q.x, q.y, 80, 70, c, 60); } }
  // Steinbruch: viele Felsen
  { const p = poi('Rust Quarry'); for (let i = 0; i < 14; i++) { const rad = ROCK_SIZES[Math.floor(r() * 3)]; const q = placeNear(p.x, p.y, 420, rad + 30, 30); if (q) { blocks.push({ x: q.x, y: q.y, r: rad + 30 }); obstacles.push({ kind: 'rock', x: q.x, y: q.y, r: rad, w: rad * 2, h: rad * 2 }); } } }

  village(poi('Sunny Farm'), 2, 320, 380, 360, 0.5);
  const grass: Area[] = [];
  // ---------- Bäume (Wald dicht, sonst verstreut; nicht in der Wüste) ----------
  forests.push({ ...poi('Pinewood'), r: 1300 }, { ...P(1900, 1650), r: 1100 }, { ...P(1150, 400), r: 1200 });
  const addTree = (q: { x: number; y: number } | null) => {
    if (!q) return;
    if (regionAt(q.x, q.y) === 'desert' || regionAt(q.x, q.y) === 'beach' || regionAt(q.x, q.y) === 'industry') return;
    blocks.push({ x: q.x, y: q.y, r: 34 });
    obstacles.push({ kind: 'tree', x: q.x, y: q.y, r: 14, w: 28, h: 28 });
  };
  for (let i = 0; i < 260; i++) addTree(placeNear(forests[0].x, forests[0].y, forests[0].r, 34, 14));
  for (let i = 0; i < 110; i++) addTree(placeNear(forests[1].x, forests[1].y, forests[1].r, 34, 20));
  for (let i = 0; i < 110; i++) addTree(placeNear(forests[2].x, forests[2].y, forests[2].r, 34, 20));
  for (let i = 0; i < 420; i++) addTree(place(34, 10));

  // ---------- Felsen ----------
  const addRock = (rad: number, q: { x: number; y: number } | null) => {
    if (!q) return;
    blocks.push({ x: q.x, y: q.y, r: rad + 30 });
    obstacles.push({ kind: 'rock', x: q.x, y: q.y, r: rad, w: rad * 2, h: rad * 2 });
  };
  const mesa = regions.find((g) => g.kind === 'desert')!;
  for (let i = 0; i < 60; i++) { const rad = ROCK_SIZES[Math.floor(r() * 3)]; addRock(rad, placeNear(mesa.x, mesa.y, mesa.r, rad + 30, 30)); }
  for (let i = 0; i < 180; i++) { const rad = ROCK_SIZES[Math.floor(r() * 3)]; addRock(rad, place(rad + 30)); }

  // ---------- Büsche, Fässer, Loot ----------
  for (let i = 0; i < 300; i++) {
    const f = forests[i % forests.length];
    const q = i < 90 ? placeNear(f.x, f.y, f.r, 38, 16) : place(38, 20);
    if (!q || regionAt(q.x, q.y) === 'desert') continue;
    blocks.push({ x: q.x, y: q.y, r: 38 });
    obstacles.push({ kind: 'bush', x: q.x, y: q.y, r: 42, w: 84, h: 84 });
  }
  for (let i = 0; i < 80; i++) {
    const q = place(50, 30);
    if (!q) continue;
    blocks.push({ x: q.x, y: q.y, r: 50 });
    obstacles.push({ kind: 'barrel', x: q.x, y: q.y, r: 17, w: 34, h: 34 });
  }
  for (let i = 0; i < 520; i++) {
    const q = place(14, 8);
    if (q) addLoot(q.x, q.y, randomLootKind(rl));
  }
  return { seed, obstacles, loot, houses, forests, ponds, fields, town, river, grass, pois, roads, ring, regions };
}
