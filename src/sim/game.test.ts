import { describe, it, expect } from 'vitest';
import { Game, segRect, Fighter } from './game';
import { generateMap } from '../mapgen';
import { WEAPONS } from '../weapons';

/** Runde ohne Flugzeugphase: Spieler steht am Boden, alle Bots sind weg */
function groundGame(seed = 1234) {
  const g = new Game(generateMap(seed));
  g.time = 30000;
  for (const f of g.fighters) {
    f.phase = 'ground';
    f.z = 0;
    if (!f.isPlayer) { f.alive = false; f.x = 10; f.y = 10; }
  }
  const p = g.player;
  const spot = g.findFreeNear(2000, 2000);
  p.x = spot.x;
  p.y = spot.y;
  return { g, p };
}
const step = (g: Game, ms: number) => { for (let t = 0; t < ms; t += 16) g.update(16); };

describe('segRect', () => {
  it('erkennt Treffer und Fehlschüsse', () => {
    const r = { x: 10, y: 10, w: 10, h: 10 };
    expect(segRect(0, 15, 30, 15, r)).toBeCloseTo(1 / 3, 3);
    expect(segRect(0, 0, 30, 0, r)).toBeNull();
  });
});

describe('Kartengenerator', () => {
  it('legt am Anfang kein Loot übereinander', () => {
    for (const seed of [1, 2, 3]) {
      const m = generateMap(seed);
      for (let i = 0; i < m.loot.length; i++)
        for (let j = i + 1; j < m.loot.length; j++)
          expect(Math.hypot(m.loot[i].x - m.loot[j].x, m.loot[i].y - m.loot[j].y)).toBeGreaterThanOrEqual(80);
    }
  });
  it('stellt Loot-Kisten nur in Häuser', () => {
    const g = new Game(generateMap(7));
    const chests = g.obstacles.filter((o) => o.kind === 'chest');
    expect(chests.length).toBeGreaterThan(0);
    for (const c of chests) expect(g.houseAt(c.x, c.y)).toBeGreaterThanOrEqual(0);
    expect(g.obstacles.some((o) => o.kind === 'crate')).toBe(false);
  });
});

describe('Heilung', () => {
  it('wird bei vollen Leben nicht aufgehoben', () => {
    const { g, p } = groundGame();
    const l = g.spawnLoot(p.x, p.y, 'medkit');
    expect(g.tryPickup(p, l, false)).toBe(false);
  });
  it('heilt nach kurzer Nutzungszeit', () => {
    const { g, p } = groundGame();
    p.hp = 50;
    const l = g.spawnLoot(p.x + 500, p.y, 'medkit');
    expect(g.tryPickup(p, l, false)).toBe(true);
    expect(p.hp).toBe(50);
    step(g, 600);
    expect(p.hp).toBe(80);
  });
});

describe('Waffen', () => {
  it('Minigun dreht erst hoch, bevor sie schießt', () => {
    const { g, p } = groundGame();
    p.weapon = WEAPONS.minigun;
    p.mag = WEAPONS.minigun.mag;
    g.input.aim = 0;
    g.input.firing = true;
    step(g, 300);
    expect(p.mag).toBe(WEAPONS.minigun.mag);
    step(g, 400);
    expect(p.mag).toBeLessThan(WEAPONS.minigun.mag);
  });
  it('zweiter Waffenplatz: alte Waffe wird gemerkt und getauscht', () => {
    const { g, p } = groundGame();
    const l = g.spawnLoot(p.x, p.y, 'w:rifle');
    g.tryPickup(p, l, true);
    expect(p.weapon.id).toBe('rifle');
    expect(p.backup?.w.id).toBe('pistol');
    g.swapWeapon(p);
    expect(p.weapon.id).toBe('pistol');
    expect(p.backup?.w.id).toBe('rifle');
  });
});

describe('Loot-Kisten', () => {
  it('Inhalt bleibt im Haus', () => {
    const { g } = groundGame(99);
    for (const c of g.obstacles.filter((o) => o.kind === 'chest')) {
      const before = g.loot.length;
      (g as unknown as { openCrate: (o: unknown) => void }).openCrate(c);
      const h = g.houses[g.houseAt(c.x, c.y)];
      for (const l of g.loot.slice(before)) {
        expect(Math.abs(l.x - h.x)).toBeLessThanOrEqual(h.s / 2);
        expect(Math.abs(l.y - h.y)).toBeLessThanOrEqual(h.s / 2);
      }
    }
  });
});

describe('Bewegung', () => {
  it('beschleunigt weich statt sofort', () => {
    const { g, p } = groundGame();
    g.input.mx = 1;
    step(g, 32);
    const early = Math.hypot(p.vx, p.vy);
    step(g, 800);
    const later = Math.hypot(p.vx, p.vy);
    expect(early).toBeLessThan(later * 0.5);
    expect(later).toBeGreaterThan(100);
  });
  it('Zielen macht langsamer', () => {
    const { g, p } = groundGame();
    const normal = g.speedOf(p);
    p.aiming = true;
    expect(g.speedOf(p)).toBeCloseTo(normal * 0.7, 3);
  });
});

void Fighter;
