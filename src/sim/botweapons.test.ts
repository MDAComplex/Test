import { it, expect } from 'vitest';
import { Game } from './game';
import { generateMap } from '../mapgen';
it('Bots finden Waffen', () => {
  const res: number[] = [];
  for (const seed of [1, 2, 3]) {
    const g = new Game(generateMap(seed));
    g.input.jump = true;
    for (let t = 0; t < 20000 + 60000; t += 33) g.update(33);
    const bots = g.fighters.filter((f) => !f.isPlayer && f.alive);
    res.push(bots.filter((f) => f.weapon.id !== 'fists').length / Math.max(1, bots.length));
  }
  console.log('Anteil Bots mit Waffe nach 60 s:', res.map((r) => Math.round(r * 100) + '%').join(', '));
  expect(Math.min(...res)).toBeGreaterThan(0.6);
});
