import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { generateMap, MapData } from '../mapgen';
import { WORLD } from '../config';

/** Gesamt-Check: viele zufällige Karten auf Fehler prüfen und ganze Runden durchspielen */

// die Karte ist fest; mehrere Seeds prüfen nur verschiedene Loot-Verteilungen
const SEEDS = Array.from({ length: 3 }, (_, i) => i * 7919 + 13);

function riverDist(m: MapData, x: number, y: number) {
  const pts = m.river.pts;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / l2));
    best = Math.min(best, Math.hypot(x - a.x - vx * t, y - a.y - vy * t));
  }
  return best;
}
function onBridge(m: MapData, x: number, y: number) {
  const half = (m.river.width + 150) / 2;
  return m.river.bridges.some((b) => {
    const ca = Math.cos(b.angle), sa = Math.sin(b.angle), dx = x - b.x, dy = y - b.y;
    return Math.abs(dx * ca + dy * sa) < 60 && Math.abs(-dx * sa + dy * ca) < half;
  });
}
const inWater = (m: MapData, x: number, y: number, pad = 0) =>
  (riverDist(m, x, y) < m.river.width / 2 + pad && !onBridge(m, x, y)) || m.ponds.some((p) => !p.ice && Math.hypot(p.x - x, p.y - y) < p.r + pad);
const rectGap = (h: { x: number; y: number; s: number }, x: number, y: number) =>
  Math.hypot(Math.max(0, Math.abs(x - h.x) - h.s / 2), Math.max(0, Math.abs(y - h.y) - h.s / 2));

describe('Karten-Check (60 Karten)', () => {
  const maps = SEEDS.map((s) => generateMap(s));

  it('Häuser: überlappen nicht, nicht im Wasser, auf der Insel', () => {
    for (const m of maps) {
      for (const [i, h] of m.houses.entries()) {
        expect(h.x - h.s / 2).toBeGreaterThan(60);
        expect(h.y - h.s / 2).toBeGreaterThan(60);
        expect(h.x + h.s / 2).toBeLessThan(WORLD - 60);
        expect(h.y + h.s / 2).toBeLessThan(WORLD - 60);
        for (const o of m.houses.slice(i + 1)) {
          const gap = Math.max(Math.abs(h.x - o.x) - (h.s + o.s) / 2, Math.abs(h.y - o.y) - (h.s + o.s) / 2);
          expect(gap).toBeGreaterThan(0);
        }
        // Fluss und Teiche halten Abstand zu den Hauswänden
        for (const w of m.river.water) expect(rectGap(h, w.x, w.y)).toBeGreaterThan(m.river.width / 2);
        for (const p of m.ponds) expect(rectGap(h, p.x, p.y)).toBeGreaterThan(p.r);
      }
    }
  });

  it('jedes Haus hat mindestens eine Tür, und davor ist kein Wasser', () => {
    for (const m of maps) for (const h of m.houses) {
      expect(h.doors.length).toBeGreaterThan(0);
      for (const d of h.doors) expect(inWater(m, d.x + d.nx * 80, d.y + d.ny * 80)).toBe(false);
    }
  });

  it('Loot liegt nicht im Wasser und nicht in Wänden', () => {
    let bad = 0;
    for (const m of maps) for (const l of m.loot) {
      if (inWater(m, l.x, l.y, 10)) bad++;
      for (const o of m.obstacles) {
        if (o.kind !== 'wall' && o.kind !== 'rock') continue;
        if (o.kind === 'wall' && Math.abs(o.x - l.x) < o.w / 2 && Math.abs(o.y - l.y) < o.h / 2) bad++;
        if (o.kind === 'rock' && Math.hypot(o.x - l.x, o.y - l.y) < o.r) bad++;
      }
    }
    expect(bad).toBe(0);
  });

  it('Kisten stehen in Häusern, Bäume/Steine nicht in Häusern, im Wasser oder auf Brücken', () => {
    for (const m of maps) for (const o of m.obstacles) {
      if (o.kind === 'chest') expect(m.houses.some((h) => rectGap(h, o.x, o.y) === 0)).toBe(true);
      if (o.kind === 'tree' || o.kind === 'rock' || o.kind === 'barrel') {
        expect(m.houses.some((h) => rectGap(h, o.x, o.y) < o.r)).toBe(false);
        expect(inWater(m, o.x, o.y)).toBe(false);
        expect(onBridge(m, o.x, o.y)).toBe(false);
      }
    }
  });

  it('Brücken liegen auf dem Fluss, beide Enden an Land', () => {
    for (const m of maps) {
      expect(m.river.bridges.length).toBeGreaterThanOrEqual(2);
      for (const b of m.river.bridges) {
        expect(riverDist(m, b.x, b.y)).toBeLessThan(30);
        const half = (m.river.width + 150) / 2, ca = Math.cos(b.angle), sa = Math.sin(b.angle);
        for (const s of [-1, 1]) {
          const ex = b.x - sa * half * s, ey = b.y + ca * half * s;
          expect(riverDist(m, ex, ey)).toBeGreaterThan(m.river.width / 2);
        }
      }
    }
  });
});

describe('Runden-Check (alle Modi)', () => {
  for (const mode of ['solo', 'duo', 'squad'] as const) {
    it(`${mode}: ganze Runde ohne Fehler, niemand im Wasser oder in Wänden, es gibt einen Sieger`, () => {
      for (const seed of [3]) {
        const g = new Game(generateMap(seed), undefined, mode);
        // der Spieler schaut nur zu (sonst steht er in der Zone herum und gewinnt nie)
        g.player.alive = false; g.player.x = 5; g.player.y = 5;
        let errors = 0;
        const teamsAlive = () => new Set(g.fighters.filter((f) => f.alive && !f.isPlayer).map((f) => f.team)).size;
        let t = 0;
        for (; t < 1500000 && teamsAlive() > 1; t += 50) {
          g.update(50);
          g.events = [];
          if (t % 1000 !== 0) continue;
          for (const f of g.fighters) {
            if (!f.alive || f.isPlayer) continue;
            if (!Number.isFinite(f.x) || !Number.isFinite(f.y)) errors++;
            if (f.phase !== 'ground') continue;
            if (f.x < 0 || f.y < 0 || f.x > WORLD || f.y > WORLD) errors++;
            if (inWater(g.map, f.x, f.y, -12)) errors++;
            if (g.obstacles.some((o) => o.kind === 'wall' && f.x > o.rect.x + 4 && f.x < o.rect.x + o.rect.w - 4 && f.y > o.rect.y + 4 && f.y < o.rect.y + o.rect.h - 4)) errors++;
          }
          if (g.loot.length > 1100) errors++;
        }
        console.log(`${mode} seed ${seed}: Runde vorbei nach ${Math.round(t / 1000)} s, Fehler: ${errors}`);
        expect(errors).toBe(0);
        expect(teamsAlive()).toBeLessThanOrEqual(1);
      }
    }, 900000);
  }
});

describe('Beute am Ufer', () => {
  it('fällt nicht ins Wasser', () => {
    const g = new Game(generateMap(9));
    const w = g.map.river.water[Math.floor(g.map.river.water.length / 2)];
    const l = g.spawnLoot(w.x, w.y, 'ammo');
    expect(inWater(g.map, l.x, l.y)).toBe(false);
    const pd = g.map.ponds[0];
    if (pd) { const l2 = g.spawnLoot(pd.x, pd.y, 'ammo'); expect(inWater(g.map, l2.x, l2.y)).toBe(false); }
  });
});

describe('Durchgänge', () => {
  const maps = SEEDS.map((s) => generateMap(s));
  it('zwischen Felsen, Bäumen und Fässern passt immer eine Figur durch', () => {
    let tight = 0;
    for (const m of maps) {
      const solid = m.obstacles.filter((o) => o.kind === 'rock' || o.kind === 'tree' || o.kind === 'barrel');
      for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i], b = solid[j];
        const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
        // direkt aneinanderstehende Fass-Paare zählen als ein Block
        if (a.kind === 'barrel' && b.kind === 'barrel' && gap < 10) continue;
        if (gap > -1 && gap < 2 * 18 + 6) tight++;
      }
    }
    expect(tight).toBe(0);
  });
  it('vor beiden Brückenenden ist frei', () => {
    for (const m of maps) for (const b of m.river.bridges) {
      const px = -Math.sin(b.angle), py = Math.cos(b.angle), half = (m.river.width + 150) / 2;
      for (const side of [-1, 1]) for (const d of [half + 20, half + 100, half + 180]) {
        const x = b.x + px * d * side, y = b.y + py * d * side;
        const hit = m.obstacles.some((o) => (o.kind === 'rock' || o.kind === 'tree' || o.kind === 'barrel') && Math.hypot(o.x - x, o.y - y) < o.r + 40);
        expect(hit).toBe(false);
      }
    }
  });
});
