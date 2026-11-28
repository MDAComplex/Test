import { describe, it, expect } from 'vitest';
import { generateMap } from '../mapgen';
it('erzeugt Fluss und Brücken', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const m = generateMap(seed);
    expect(m.river.bridges.length).toBeGreaterThanOrEqual(2);
  }
});

it('Innenwände versperren keine Haustür', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const m = generateMap(seed);
    for (const h of m.houses) {
      for (const d of h.doors) {
        // Punkt knapp innerhalb der Tür muss frei von Wänden sein
        const px = d.x - d.nx * 50, py = d.y - d.ny * 50;
        const blocked = m.obstacles.some((o) => o.kind === 'wall' && Math.abs(o.x - px) < o.w / 2 + 20 && Math.abs(o.y - py) < o.h / 2 + 20);
        expect(blocked).toBe(false);
      }
    }
  }
});

describe('Dorfplatz', () => {
  it('kein Haus, Teich oder Fluss auf dem Brunnenplatz', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = generateMap(seed);
      const t = m.town;
      for (const h of m.houses) {
        // Abstand Platzmitte zum Hausrechteck
        const dx = Math.max(0, Math.abs(t.x - h.x) - h.s / 2), dy = Math.max(0, Math.abs(t.y - h.y) - h.s / 2);
        expect(Math.hypot(dx, dy)).toBeGreaterThan(150);
      }
      for (const p of m.ponds) expect(Math.hypot(p.x - t.x, p.y - t.y)).toBeGreaterThan(p.r + 150);
      for (const w of m.river.water) expect(Math.hypot(w.x - t.x, w.y - t.y)).toBeGreaterThan(m.river.width / 2 + 100);
    }
  });
});
