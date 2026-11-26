import { it, expect } from 'vitest';
import { generateMap } from '../mapgen';
it('erzeugt Grasfelder, Fluss und Brücken', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const m = generateMap(seed);
    expect(m.grass.length).toBeGreaterThanOrEqual(3);
    expect(m.river.bridges.length).toBeGreaterThanOrEqual(2);
  }
});
