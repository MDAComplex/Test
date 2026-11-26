import { it, expect } from 'vitest';
import { generateMap } from '../mapgen';
it('erzeugt Grasfelder, Fluss und Brücken', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const m = generateMap(seed);
    expect(m.grass.length).toBeGreaterThanOrEqual(3);
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
