import { it, expect } from 'vitest';
import { Game } from './game';
import { generateMap } from '../mapgen';
it('Bots finden Waffen', () => {
  const res: number[] = [];
  for (const seed of [1, 2, 3]) {
    const g = new Game(generateMap(seed));
    g.input.jump = true;
    // 15 s Auswahl + ca. 9 s Fall, dann 45 s am Boden (es leben noch genug Bots für einen stabilen Wert)
    for (let t = 0; t < 15000 + 9000 + 45000; t += 33) g.update(33);
    const bots = g.fighters.filter((f) => !f.isPlayer && f.alive);
    res.push(bots.filter((f) => f.weapon.id !== 'fists').length / Math.max(1, bots.length));
  }
  console.log('Anteil Bots mit Waffe nach 45 s am Boden:', res.map((r) => Math.round(r * 100) + '%').join(', '));
  const avg = res.reduce((a, b) => a + b, 0) / res.length;
  expect(avg).toBeGreaterThan(0.6);
  expect(Math.min(...res)).toBeGreaterThan(0.4);
});
