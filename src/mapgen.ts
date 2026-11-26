import { WORLD } from './config';
import { mulberry32 } from './rng';

export type ObsKind = 'tree' | 'rock' | 'crate' | 'wall' | 'bush';
export interface Obs { kind: ObsKind; x: number; y: number; r: number; w: number; h: number }
export type LootKind = 'ammo' | 'armor' | 'medkit' | 'w:pistol' | 'w:smg' | 'w:shotgun' | 'w:rifle' | 'w:sniper';
export interface LootSpawn { x: number; y: number; kind: LootKind }
export interface MapData { seed: number; obstacles: Obs[]; loot: LootSpawn[] }

export const ROCK_SIZES = [28, 38, 48];

export function randomLootKind(r: () => number): LootKind {
  const v = r();
  if (v < 0.32) {
    const w = r();
    return w < 0.12 ? 'w:pistol' : w < 0.42 ? 'w:smg' : w < 0.66 ? 'w:shotgun' : w < 0.9 ? 'w:rifle' : 'w:sniper';
  }
  if (v < 0.6) return 'ammo';
  if (v < 0.76) return 'armor';
  return 'medkit';
}

export function generateMap(seed: number): MapData {
  const r = mulberry32(seed);
  const obstacles: Obs[] = [];
  const loot: LootSpawn[] = [];
  const blocks: { x: number; y: number; r: number }[] = [];
  const M = 120;

  const fits = (x: number, y: number, rad: number, pad: number) => {
    if (x < M + rad || y < M + rad || x > WORLD - M - rad || y > WORLD - M - rad) return false;
    for (const b of blocks) {
      const dx = b.x - x, dy = b.y - y, m = b.r + rad + pad;
      if (dx * dx + dy * dy < m * m) return false;
    }
    return true;
  };
  const place = (rad: number, pad = 30, tries = 50) => {
    for (let i = 0; i < tries; i++) {
      const x = r() * WORLD, y = r() * WORLD;
      if (fits(x, y, rad, pad)) return { x, y };
    }
    return null;
  };

  // Häuser mit Türöffnung
  for (let i = 0; i < 13; i++) {
    const s = 240 + Math.floor(r() * 90);
    const p = place(s * 0.72, 40, 80);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: s * 0.72 });
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
    seg(true, p.y - h + t / 2, p.x - h, p.x + h, isDoor(0));
    seg(true, p.y + h - t / 2, p.x - h, p.x + h, isDoor(1));
    seg(false, p.x - h + t / 2, p.y - h + t, p.y + h - t, isDoor(2));
    seg(false, p.x + h - t / 2, p.y - h + t, p.y + h - t, isDoor(3));
    if (r() < 0.6) obstacles.push({ kind: 'crate', x: p.x - h + t + 30, y: p.y - h + t + 30, r: 22, w: 44, h: 44 });
    const n = 2 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) {
      loot.push({ x: p.x + (r() - 0.5) * (s - 140), y: p.y + (r() - 0.5) * (s - 140), kind: randomLootKind(r) });
    }
  }

  for (let i = 0; i < 65; i++) {
    const rad = ROCK_SIZES[Math.floor(r() * ROCK_SIZES.length)];
    const p = place(rad);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: rad });
    obstacles.push({ kind: 'rock', x: p.x, y: p.y, r: rad, w: rad * 2, h: rad * 2 });
  }
  for (let i = 0; i < 110; i++) {
    const p = place(34);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: 34 });
    obstacles.push({ kind: 'tree', x: p.x, y: p.y, r: 14, w: 28, h: 28 });
  }
  for (let i = 0; i < 40; i++) {
    const p = place(31);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: 31 });
    obstacles.push({ kind: 'crate', x: p.x, y: p.y, r: 22, w: 44, h: 44 });
  }
  for (let i = 0; i < 55; i++) {
    const p = place(38, 20);
    if (!p) continue;
    blocks.push({ x: p.x, y: p.y, r: 38 });
    obstacles.push({ kind: 'bush', x: p.x, y: p.y, r: 42, w: 84, h: 84 });
  }
  for (let i = 0; i < 170; i++) {
    const p = place(14, 8);
    if (!p) continue;
    loot.push({ x: p.x, y: p.y, kind: randomLootKind(r) });
  }
  return { seed, obstacles, loot };
}
