import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { generateMap, ISLETS } from '../mapgen';
import { WORLD } from '../config';

/**
 * Logik-Check der festen Karte: Ist alles zu Fuß erreichbar? (Orte, Häuser, Loot, Leuchtturm-Insel, Straßen)
 * Laufraster mit 30er Zellen, Breitensuche ab dem Stadtplatz.
 */
describe('Erreichbarkeit der Karte', () => {
  const g = new Game(generateMap(5));
  for (const f of g.fighters) { f.alive = false; f.x = 5; f.y = 5; }
  const C = 30, N = Math.ceil(WORLD / C);
  const free = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) free[j * N + i] = g.isFree(i * C + C / 2, j * C + C / 2, 19) ? 1 : 0;
  // Start: freie Zelle nahe am Stadtplatz
  const t = g.map.town;
  const start = g.findFreeNear(t.x + 400, t.y);
  const seen = new Uint8Array(N * N);
  const q: number[] = [];
  const si = Math.floor(start.x / C), sj = Math.floor(start.y / C);
  seen[sj * N + si] = 1; q.push(sj * N + si);
  while (q.length) {
    const c = q.pop()!, i = c % N, j = (c - i) / N;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const k = nj * N + ni;
      if (seen[k] || !free[k]) continue;
      seen[k] = 1; q.push(k);
    }
  }
  /** erreichbar, wenn eine erreichbare Zelle im Umkreis rad liegt */
  const reach = (x: number, y: number, rad = 45) => {
    const r = Math.ceil(rad / C);
    const i0 = Math.floor(x / C), j0 = Math.floor(y / C);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i >= 0 && j >= 0 && i < N && j < N && seen[j * N + i] && Math.hypot(di * C, dj * C) <= rad + C) return true;
    }
    return false;
  };

  it('große Teile der Insel sind zusammenhängend begehbar', () => {
    let f = 0, s = 0;
    for (let k = 0; k < N * N; k++) { f += free[k]; s += seen[k]; }
    // fast alles Freie gehört zum großen Gebiet (Rest: kleine Nischen zwischen Felsen o. Ä.)
    expect(s / f).toBeGreaterThan(0.97);
  });
  it('jeder Ort ist erreichbar', () => {
    const bad = g.map.pois.filter((p) => !reach(p.x, p.y, Math.max(200, p.r)));
    expect(bad.map((p) => p.name)).toEqual([]);
  });
  it('jedes Haus: vor jeder Tür und drinnen erreichbar', () => {
    const bad: string[] = [];
    for (const h of g.map.houses) for (const d of h.doors) {
      if (!reach(d.x + d.nx * 70, d.y + d.ny * 70)) bad.push(`vor Tür ${Math.round(h.x)},${Math.round(h.y)}`);
      if (!reach(d.x - d.nx * 70, d.y - d.ny * 70)) bad.push(`hinter Tür ${Math.round(h.x)},${Math.round(h.y)}`);
    }
    expect(bad).toEqual([]);
  });
  it('Loot und Truhen sind erreichbar', () => {
    const bad = g.loot.filter((l) => !reach(l.x, l.y, 60));
    expect(bad.length).toBeLessThanOrEqual(Math.ceil(g.loot.length * 0.01));
    const chests = g.obstacles.filter((o) => o.kind === 'chest');
    expect(chests.filter((c) => !reach(c.x, c.y, 80)).length).toBe(0);
    expect(chests.filter((c) => c.gold).length).toBe(2);
  });
  it('Leuchtturm-Insel ist über den Steg erreichbar', () => {
    const i = ISLETS[0];
    expect(reach(i.x + i.r * 0.6, i.y, 80) || reach(i.x - i.r * 0.6, i.y, 80) || reach(i.x, i.y + i.r * 0.6, 80) || reach(i.x, i.y - i.r * 0.6, 80)).toBe(true);
  });
  it('Straßen sind nicht zugestellt', () => {
    let blocked = 0, total = 0;
    for (const rd of g.map.roads) {
      if (rd.w < 80) continue;
      for (let k = 0; k < rd.pts.length - 1; k++) {
        const a = rd.pts[k], b = rd.pts[k + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 60);
        for (let m = 1; m < n; m++) {
          const x = a.x + (b.x - a.x) * m / n, y = a.y + (b.y - a.y) * m / n;
          // Fluss (Brücken) und Meer (Stegende) zählen nicht
          if (g.map.river.water.some((w) => Math.hypot(w.x - x, w.y - y) < g.map.river.width / 2 + 60)) continue;
          total++;
          if (!g.isFree(x, y, 10)) blocked++;
        }
      }
    }
    expect(blocked / total).toBeLessThan(0.01);
  });
  it('Straßen und Wege schneiden keine Häuser, Requisiten stehen nicht in Häusern', () => {
    const gap = (h: { x: number; y: number; s: number }, x: number, y: number) => Math.hypot(Math.max(0, Math.abs(x - h.x) - h.s / 2), Math.max(0, Math.abs(y - h.y) - h.s / 2));
    const bad: string[] = [];
    for (const rd of g.map.roads) for (let i = 0; i < rd.pts.length - 1; i++) {
      const a = rd.pts[i], b = rd.pts[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 20);
      for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
        for (const h of g.map.houses) if (gap(h, x, y) < rd.w / 2 - 6) { bad.push(`Weg bei ${Math.round(x)},${Math.round(y)}`); break; }
      }
    }
    for (const o of g.map.obstacles) if (o.hide && g.map.houses.some((h) => gap(h, o.x, o.y) < Math.max(o.w, o.h) / 2 - 4)) bad.push(`Requisit bei ${Math.round(o.x)},${Math.round(o.y)}`);
    expect(bad).toEqual([]);
  });
  it('Tempel hat vier Eingänge, goldene Truhen stehen frei in der Mitte', () => {
    const golds = g.obstacles.filter((o) => o.gold);
    for (const c of golds) {
      const h = g.map.houses[g.houseAt(c.x, c.y)];
      expect(h).toBeTruthy();
      expect(Math.hypot(h.x - c.x, h.y - c.y)).toBeLessThan(5);
      if (h.style === 'jp') expect(h.doors.length).toBe(4);
    }
  });
  it('zwischen Containern und anderen Blöcken passt man durch (oder sie stehen dicht an dicht)', () => {
    const boxes = g.obstacles.filter((o) => o.kind === 'box' || o.kind === 'wall');
    let tight = 0;
    for (const a of g.obstacles.filter((o) => o.kind === 'box' && o.hide)) for (const b of boxes) {
      if (a === b) continue;
      const gx = Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2), gy = Math.max(0, Math.abs(a.y - b.y) - (a.h + b.h) / 2);
      const gap = Math.hypot(gx, gy);
      if (gap > 2 && gap < 44) tight++;
    }
    expect(tight).toBe(0);
  });
});
