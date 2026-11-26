import { it, expect } from 'vitest';
import { Game } from './game';
import { generateMap } from '../mapgen';
it('man kann durch jede Haustür ins Haus laufen', () => {
  const fails: string[] = [];
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = new Game(generateMap(seed));
    const p = g.player;
    for (const f of g.fighters) { f.phase = 'ground'; f.z = 0; if (!f.isPlayer) { f.alive = false; f.x = 10; f.y = 10; } }
    g.time = 30000;
    g.houses.forEach((h, hi) => h.doors.forEach((d, di) => {
      p.x = d.x + d.nx * 90; p.y = d.y + d.ny * 90; p.vx = p.vy = 0;
      if (p.x < 60 || p.y < 60 || p.x > 3940 || p.y > 3940) return;
      g.input.mx = -d.nx; g.input.my = -d.ny;
      for (let t = 0; t < 1500; t += 16) g.update(16);
      if (g.houseAt(p.x, p.y) !== hi) fails.push(`seed ${seed} Haus ${hi} Tür ${di}: (${Math.round(p.x - h.x)},${Math.round(p.y - h.y)}) s=${h.s}`);
    }));
    g.input.mx = 0; g.input.my = 0;
  }
  console.log(fails.slice(0, 8).join('\n'));
  expect(fails.length).toBe(0);
});
