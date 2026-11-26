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
  // Startpunkt mit freiem Weg nach rechts (nicht am Fluss oder an Wänden)
  let spot = g.findFreeNear(2000, 2000);
  for (let y = 300; y < 3700; y += 97) {
    let ok = true;
    for (let dx = 0; dx <= 400; dx += 40) if (!g.isFree(800 + dx, y, 40)) { ok = false; break; }
    if (ok) { spot = { x: 800, y }; break; }
  }
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
    expect(p.weapon.id).toBe('fists');
    // erste Waffe ersetzt die Fäuste
    g.tryPickup(p, g.spawnLoot(p.x, p.y, 'w:rifle'), true);
    expect(p.weapon.id).toBe('rifle');
    expect(p.backup).toBeNull();
    // zweite Waffe: alte wandert in den zweiten Platz
    g.tryPickup(p, g.spawnLoot(p.x, p.y, 'w:smg'), true);
    expect(p.weapon.id).toBe('smg');
    expect(p.backup?.w.id).toBe('rifle');
    g.swapWeapon(p);
    expect(p.weapon.id).toBe('rifle');
    expect(p.backup?.w.id).toBe('smg');
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

describe('Fäuste', () => {
  it('Schlag trifft nur Gegner direkt davor', () => {
    const { g, p } = groundGame();
    const e = g.fighters[1];
    e.alive = true; e.phase = 'ground'; e.armor = 0; e.hp = 100;
    e.x = p.x + 40; e.y = p.y;
    p.aim = 0;
    g.input.aim = 0;
    g.input.firing = true;
    g.update(16);
    expect(e.hp).toBeLessThan(100);
    const hp = e.hp;
    e.x = p.x + 200;
    for (let t = 0; t < 600; t += 16) g.update(16);
    expect(e.hp).toBe(hp);
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

describe('Team-Modi', () => {
  const teamGame = (mode: 'duo' | 'squad') => {
    const g = new Game(generateMap(42), 0xffd23f, mode);
    g.time = 30000;
    for (const f of g.fighters) { f.phase = 'ground'; f.z = 0; f.x = 3800; f.y = 3800; }
    const spot = g.findFreeNear(2000, 2000);
    g.player.x = spot.x; g.player.y = spot.y;
    return g;
  };
  it('bildet die richtige Anzahl Teams', () => {
    expect(teamGame('duo').teamCount()).toBe(12);
    expect(teamGame('squad').teamCount()).toBe(6);
    const sq = teamGame('squad');
    expect(sq.teammates(sq.player).length).toBe(3);
  });
  it('kein Eigenbeschuss und Niederschlagen statt sofortigem Tod', () => {
    const g = teamGame('duo');
    const mate = g.teammates(g.player)[0];
    mate.x = g.player.x + 60; mate.y = g.player.y;
    const enemy = g.fighters.find((f) => f.team !== g.player.team)!;
    // Spieler wird von Gegner auf 0 gebracht, Teamkamerad steht noch
    g.damage(g.player, 500, enemy, true, 'Test');
    expect(g.player.alive).toBe(true);
    expect(g.player.downed).toBe(true);
    // Teamkamerad steht daneben: nach 3,5 s wiederbelebt
    for (let t = 0; t < 3700; t += 16) g.update(16);
    expect(g.player.downed).toBe(false);
    expect(g.player.hp).toBe(30);
  });
  it('Team ist raus, wenn alle niedergeschlagen sind', () => {
    const g = teamGame('duo');
    const mate = g.teammates(g.player)[0];
    const enemy = g.fighters.find((f) => f.team !== g.player.team)!;
    g.damage(mate, 500, enemy, true, 'Test');
    expect(mate.downed).toBe(true);
    g.damage(g.player, 500, enemy, true, 'Test');
    expect(g.player.alive).toBe(false);
    expect(mate.alive).toBe(false);
    expect(g.over).toBe(true);
  });
});

describe('Fallschirm', () => {
  it('landet nie in einem Haus', () => {
    const g = new Game(generateMap(5));
    const p = g.player;
    const h = g.houses[0];
    g.time = 25000;
    p.phase = 'fall';
    p.z = 150;
    p.x = h.x;
    p.y = h.y;
    for (let t = 0; t < 4000 && (p.phase as string) !== 'ground'; t += 16) g.update(16);
    expect(p.phase).toBe('ground');
    expect(g.houseAt(p.x, p.y)).toBe(-1);
  });
});

describe('Loot-Kisten (Platzierung)', () => {
  it('kein Gegenstand landet in der Kiste', () => {
    for (const seed of [11, 12, 13]) {
      const g = new Game(generateMap(seed));
      for (const c of g.obstacles.filter((o) => o.kind === 'chest')) {
        const before = g.loot.length;
        (g as unknown as { openCrate: (o: unknown) => void }).openCrate(c);
        for (const l of g.loot.slice(before)) {
          const inside = Math.abs(l.x - c.x) < c.w / 2 + 10 && Math.abs(l.y - c.y) < c.h / 2 + 10;
          expect(inside).toBe(false);
        }
      }
    }
  });
});
