import { WORLD } from './config';
import { mulberry32 } from './rng';

export type ObsKind = 'tree' | 'rock' | 'crate' | 'chest' | 'airdrop' | 'wall' | 'bush' | 'water' | 'fence' | 'barrel' | 'hay';
export interface Obs { kind: ObsKind; x: number; y: number; r: number; w: number; h: number }
export type LootKind = 'ammo' | 'armor' | 'medkit' | 'bigmed' | 'w:pistol' | 'w:smg' | 'w:shotgun' | 'w:rifle' | 'w:sniper' | 'w:minigun' | 'w:rocket';
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
  river: { pts: { x: number; y: number }[]; width: number; bridges: { x: number; y: number; angle: number }[] };
  /** hohe Grasfelder: darin ist man unsichtbar */
  grass: Area[];
}

export const ROCK_SIZES = [28, 38, 48];

export function randomLootKind(r: () => number): LootKind {
  // Verteilung: Munition 50 %, Waffen 22 %, Heilung 18 %, Schild 10 %
  const v = r();
  if (v < 0.22) {
    const w = r();
    return w < 0.14 ? 'w:pistol' : w < 0.44 ? 'w:smg' : w < 0.68 ? 'w:shotgun' : w < 0.92 ? 'w:rifle' : 'w:sniper';
  }
  if (v < 0.72) return 'ammo';
  if (v < 0.82) return 'armor';
  return v < 0.95 ? 'medkit' : 'bigmed';
}

export function generateMap(seed: number): MapData {
  const r = mulberry32(seed);
  const obstacles: Obs[] = [];
  const loot: LootSpawn[] = [];
  const houses: House[] = [];
  const forests: Area[] = [];
  const ponds: Area[] = [];
  const fields: Field[] = [];
  const blocks: { x: number; y: number; r: number }[] = [];
  const M = 130;

  const fits = (x: number, y: number, rad: number, pad: number) => {
    if (x < M + rad || y < M + rad || x > WORLD - M - rad || y > WORLD - M - rad) return false;
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
    for (const l of loot) if ((l.x - x) ** 2 + (l.y - y) ** 2 < LOOT_GAP * LOOT_GAP) return false;
    for (const o of obstacles) {
      if (o.kind === 'wall' && Math.abs(o.x - x) < o.w / 2 + 30 && Math.abs(o.y - y) < o.h / 2 + 30) return false;
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

  // Fluss: schlängelt sich von einer Kante zur gegenüberliegenden, mit 2–3 Brücken
  const RIVER_W = 170;
  const horizontal = r() < 0.5;
  const pts: { x: number; y: number }[] = [];
  const base = WORLD * (0.3 + r() * 0.4);
  const phase = r() * 6;
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const along = -60 + t * (WORLD + 120);
    const off = base + Math.sin(t * Math.PI * 2 + phase) * 260 + (r() - 0.5) * 120;
    pts.push(horizontal ? { x: along, y: off } : { x: off, y: along });
  }
  // gleichmäßig abtasten
  const samples: { x: number; y: number; a: number }[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(len / 50);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      samples.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) });
    }
  }
  const bridgeIdx = [0.28, 0.55, 0.8].filter(() => r() < 0.85).map((t) => Math.floor(t * samples.length));
  if (bridgeIdx.length < 2) bridgeIdx.splice(0, bridgeIdx.length, Math.floor(samples.length * 0.33), Math.floor(samples.length * 0.7));
  const bridges = bridgeIdx.map((i) => ({ x: samples[i].x, y: samples[i].y, angle: samples[i].a }));
  for (const sp of samples) {
    // Lücke an den Brücken: dort kann man den Fluss überqueren
    if (bridges.some((b) => Math.hypot(b.x - sp.x, b.y - sp.y) < 75)) continue;
    obstacles.push({ kind: 'water', x: sp.x, y: sp.y, r: RIVER_W / 2, w: RIVER_W, h: RIVER_W });
  }
  for (const sp of samples) blocks.push({ x: sp.x, y: sp.y, r: RIVER_W / 2 + 40 });
  const river = { pts, width: RIVER_W, bridges };

  // Teiche
  for (let i = 0; i < 4; i++) {
    const rad = 120 + r() * 100;
    const p = place(rad + 40, 100);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: rad + 40 });
    ponds.push({ x: p.x, y: p.y, r: rad });
    obstacles.push({ kind: 'water', x: p.x, y: p.y, r: rad, w: rad * 2, h: rad * 2 });
  }

  // Dorf in der Kartenmitte-Region
  const town: Area = { x: WORLD * (0.35 + r() * 0.3), y: WORLD * (0.35 + r() * 0.3), r: 700 };

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
      const gap = 92;
      if (r() < 0.5) {
        const y1 = p.y - h + t, y2 = p.y + h - t, mid = p.y + (r() - 0.5) * (s - 220);
        addV(p.x, y1, mid - gap / 2);
        addV(p.x, mid + gap / 2, y2);
      } else {
        const x1 = p.x - h + t, x2 = p.x + h - t, mid = p.x + (r() - 0.5) * (s - 220);
        addH(p.y, x1, mid - gap / 2);
        addH(p.y, mid + gap / 2, x2);
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
        if (addLoot(p.x + (r() - 0.5) * (s - 150), p.y + (r() - 0.5) * (s - 150), randomLootKind(r))) break;
      }
    }

    // Zaun um den Hof (mit Lücken)
    if (fenced) {
      const d = h + 70, ft = 10, gap = 100;
      const fenceH = (y: number) => {
        obstacles.push({ kind: 'fence', x: (p.x - d + p.x - gap / 2) / 2, y, w: d - gap / 2, h: ft, r: 0 });
        obstacles.push({ kind: 'fence', x: (p.x + gap / 2 + p.x + d) / 2, y, w: d - gap / 2, h: ft, r: 0 });
      };
      const fenceV = (x: number) => obstacles.push({ kind: 'fence', x, y: p.y, w: ft, h: d * 2, r: 0 });
      fenceH(p.y - d);
      fenceH(p.y + d);
      if (r() < 0.5) fenceV(p.x - d); else fenceV(p.x + d);
    }
    // Fässer neben dem Haus
    if (r() < 0.55) {
      const side = r() < 0.5 ? -1 : 1;
      const bx = p.x + side * (h + 34), by = p.y + (r() - 0.5) * s * 0.6;
      obstacles.push({ kind: 'barrel', x: bx, y: by, r: 17, w: 34, h: 34 });
      if (r() < 0.6) obstacles.push({ kind: 'barrel', x: bx, y: by + 38, r: 17, w: 34, h: 34 });
    }
  };

  // Lagerhalle
  {
    const s = 420;
    const p = place(s * 0.72, 60, 100);
    if (p) {
      blocks.push({ x: p.x, y: p.y, r: s * 0.72 });
      addHouse(p, s, false);
    }
  }
  for (let i = 0; i < 9; i++) {
    const s = 260 + Math.floor(r() * 100);
    const p = placeNear(town.x, town.y, town.r, s * 0.72, 30, 80);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: s * 0.72 });
    addHouse(p, s, false);
  }
  for (let i = 0; i < 11; i++) {
    const s = 220 + Math.floor(r() * 80);
    const fenced = r() < 0.5;
    const rad = s * 0.72 + (fenced ? 80 : 0);
    const p = place(rad, 50, 80);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: rad });
    addHouse(p, s, fenced);
  }

  // Felder mit Heuballen
  for (let i = 0; i < 3; i++) {
    const w = 460 + r() * 160, h = 320 + r() * 120;
    const p = place(Math.max(w, h) * 0.6, 40, 80);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: Math.max(w, h) * 0.6 });
    fields.push({ x: p.x, y: p.y, w, h });
    const n = 5 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const hx = p.x + (r() - 0.5) * (w - 120), hy = p.y + (r() - 0.5) * (h - 100);
      if (obstacles.some((o) => o.kind === 'hay' && Math.hypot(o.x - hx, o.y - hy) < 110)) continue;
      obstacles.push({ kind: 'hay', x: hx, y: hy, r: 0, w: 72, h: 48 });
    }
    addLoot(p.x + (r() - 0.5) * w * 0.6, p.y + (r() - 0.5) * h * 0.6, randomLootKind(r));
  }

  // hohe Grasfelder (verstecken wie in Büschen)
  const grass: Area[] = [];
  for (let i = 0; i < 7; i++) {
    const rad = 130 + r() * 90;
    const p = place(rad, 20, 80);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: rad * 0.6 });
    grass.push({ x: p.x, y: p.y, r: rad });
  }
  // Wälder
  for (let i = 0; i < 3; i++) {
    const p = place(300, 0, 80) ?? { x: r() * WORLD, y: r() * WORLD };
    forests.push({ x: p.x, y: p.y, r: 560 });
  }
  const addTree = (p: { x: number; y: number } | null) => {
    if (!p) return;
    blocks.push({ x: p.x, y: p.y, r: 34 });
    obstacles.push({ kind: 'tree', x: p.x, y: p.y, r: 14, w: 28, h: 28 });
  };
  for (const f of forests) for (let i = 0; i < 42; i++) addTree(placeNear(f.x, f.y, f.r, 34, 14));
  for (let i = 0; i < 70; i++) addTree(place(34));

  // Felsen (teils als Felsgebiet)
  const rocky = { x: r() * WORLD, y: r() * WORLD };
  const addRock = (rad: number, p: { x: number; y: number } | null) => {
    if (!p) return;
    blocks.push({ x: p.x, y: p.y, r: rad });
    obstacles.push({ kind: 'rock', x: p.x, y: p.y, r: rad, w: rad * 2, h: rad * 2 });
  };
  for (let i = 0; i < 16; i++) { const rad = ROCK_SIZES[Math.floor(r() * 3)]; addRock(rad, placeNear(rocky.x, rocky.y, 420, rad, 20)); }
  for (let i = 0; i < 50; i++) { const rad = ROCK_SIZES[Math.floor(r() * 3)]; addRock(rad, place(rad)); }

  for (let i = 0; i < 90; i++) {
    const f = forests[i % forests.length];
    const p = i < 30 ? placeNear(f.x, f.y, f.r, 38, 16) : place(38, 20);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: 38 });
    obstacles.push({ kind: 'bush', x: p.x, y: p.y, r: 42, w: 84, h: 84 });
  }
  for (let i = 0; i < 22; i++) {
    const p = place(20, 20);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: 20 });
    obstacles.push({ kind: 'barrel', x: p.x, y: p.y, r: 17, w: 34, h: 34 });
  }
  for (let i = 0; i < 120; i++) {
    const p = place(14, 8);
    if (p) addLoot(p.x, p.y, randomLootKind(r));
  }
  return { seed, obstacles, loot, houses, forests, ponds, fields, town, river, grass };
}
