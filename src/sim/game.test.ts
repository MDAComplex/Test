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
  it('nur eine Waffe: beim Aufheben fällt die alte auf den Boden', () => {
    const { g, p } = groundGame();
    expect(p.weapon.id).toBe('fists');
    g.tryPickup(p, g.spawnLoot(p.x, p.y, 'w:rifle:3'), true);
    expect(p.weapon.id).toBe('rifle');
    g.tryPickup(p, g.spawnLoot(p.x, p.y, 'w:smg:2'), true);
    expect(p.weapon.id).toBe('smg');
    expect(p.backup).toBeNull();
    expect(g.loot.some((l) => !l.taken && l.kind === 'w:rifle:3')).toBe(true);
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

describe('Blickrichtung', () => {
  it('schaut in Laufrichtung, nur beim Schießen zum Ziel', () => {
    const { g, p } = groundGame();
    g.input.mx = 1; g.input.my = 0;      // nach rechts laufen
    g.input.aim = -Math.PI / 2;          // Maus zeigt nach oben
    g.input.firing = false;
    for (let t = 0; t < 600; t += 16) g.update(16);
    expect(Math.abs(Math.atan2(Math.sin(p.aim), Math.cos(p.aim)))).toBeLessThan(0.1);
    expect(p.vx).toBeGreaterThan(50);
    g.input.firing = true;               // schießen: zur Maus drehen, weiter nach rechts laufen
    g.update(16);
    expect(p.aim).toBeCloseTo(-Math.PI / 2, 2);
    expect(p.vx).toBeGreaterThan(50);
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
    // Platz mit viel Freiraum suchen (nicht an Wasser oder Wänden)
    let spot = g.findFreeNear(2000, 2000);
    outer: for (let y = 400; y < 3600; y += 83) for (let x = 400; x < 3600; x += 83) {
      if (g.isFree(x, y, 90)) { spot = { x, y }; break outer; }
    }
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
    mate.x = g.player.x + 35; mate.y = g.player.y;
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

describe('Brücken', () => {
  it('man kann über jede Brücke laufen', () => {
    for (const seed of [21, 22, 23]) {
      const g = new Game(generateMap(seed));
      const p = g.player;
      for (const f of g.fighters) { f.phase = 'ground'; f.z = 0; if (!f.isPlayer) { f.alive = false; f.x = 10; f.y = 10; } }
      g.time = 30000;
      for (const b of g.map.river.bridges) {
        const n = b.angle + Math.PI / 2, off = g.map.river.width / 2 + 120;
        // nur Brücken prüfen, die nicht am Kartenrand liegen
        const sx = b.x + Math.cos(n) * off, sy = b.y + Math.sin(n) * off;
        if (sx < 150 || sy < 150 || sx > 3850 || sy > 3850) continue;
        p.x = sx; p.y = sy; p.vx = p.vy = 0;
        g.input.mx = -Math.cos(n); g.input.my = -Math.sin(n);
        for (let t = 0; t < 3500; t += 16) g.update(16);
        // auf der anderen Seite angekommen?
        const dx = p.x - b.x, dy = p.y - b.y;
        expect(dx * Math.cos(n) + dy * Math.sin(n)).toBeLessThan(-g.map.river.width / 2);
      }
      g.input.mx = 0; g.input.my = 0;
    }
  });
});

describe('Fluss', () => {
  it('niemand läuft durchs Wasser (außer über Brücken)', () => {
    const g = new Game(generateMap(31));
    const p = g.player;
    for (const f of g.fighters) { f.phase = 'ground'; f.z = 0; if (!f.isPlayer) { f.alive = false; f.x = 10; f.y = 10; } }
    g.time = 30000;
    const rv = g.map.river;
    // Startpunkt neben dem Fluss, weit weg von Brücken, dann quer zum Fluss laufen
    const pts = rv.water.filter((w) => w.x > 300 && w.y > 300 && w.x < 3700 && w.y < 3700 && rv.bridges.every((b) => Math.hypot(b.x - w.x, b.y - w.y) > 400));
    const w = pts[Math.floor(pts.length / 2)];
    const i = rv.water.indexOf(w), nb = rv.water[i + 1];
    const ang = Math.atan2(nb.y - w.y, nb.x - w.x) + Math.PI / 2;
    p.x = w.x + Math.cos(ang) * 160; p.y = w.y + Math.sin(ang) * 160; p.vx = p.vy = 0;
    g.input.mx = -Math.cos(ang); g.input.my = -Math.sin(ang);
    for (let t = 0; t < 3000; t += 16) g.update(16);
    const minD = Math.min(...rv.water.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
    expect(minD).toBeGreaterThan(rv.width / 2);
  });
});

describe('Brücke', () => {
  it('Geländer hält einen auf der Brücke', () => {
    for (const seed of [31, 7, 99]) {
      const g = new Game(generateMap(seed));
      const p = g.player;
      for (const f of g.fighters) { f.phase = 'ground'; f.z = 0; if (!f.isPlayer) { f.alive = false; f.x = 10; f.y = 10; } }
      g.time = 30000;
      const b = g.map.river.bridges[0];
      p.x = b.x; p.y = b.y; p.vx = p.vy = 0;
      // seitlich gegen das Geländer laufen (in Flussrichtung)
      g.input.mx = Math.cos(b.angle); g.input.my = Math.sin(b.angle);
      for (let t = 0; t < 2500; t += 16) g.update(16);
      const along = (p.x - b.x) * Math.cos(b.angle) + (p.y - b.y) * Math.sin(b.angle);
      expect(Math.abs(along)).toBeLessThan(60);
    }
  });
});

describe('Absprung', () => {
  it('landet am gewählten Punkt, Freifall vor dem Schirm', () => {
    const g = new Game(generateMap(5));
    g.update(16);
    g.chooseDrop(1200, 2600);
    let sawChute = false, sawJump = false;
    for (let t = 0; t < 40000 && g.player.phase !== 'ground'; t += 16) {
      g.update(16);
      for (const e of g.events) { if (e.type === 'chute' && e.f.isPlayer) sawChute = true; if (e.type === 'jump' && e.f.isPlayer) sawJump = true; }
      g.events = [];
    }
    expect(sawJump && sawChute).toBe(true);
    expect(g.player.phase).toBe('ground');
    expect(Math.hypot(g.player.x - 1200, g.player.y - 2600)).toBeLessThan(250);
  });
});

describe('Wiederbeleben im Team', () => {
  it('nur einer belebt, die anderen sichern mit Abstand', () => {
    const g = new Game(generateMap(12), undefined, 'squad');
    for (const f of g.fighters) { f.phase = 'ground'; f.z = 0; }
    g.time = 30000;
    const team = g.fighters.filter((f) => f.team === 1);
    for (const f of g.fighters) if (f.team !== 1) { f.alive = false; f.x = 10; f.y = 10; }
    const [down, ...rest] = team;
    const c = { x: 2000, y: 2000 };
    down.x = c.x; down.y = c.y; down.downed = true; down.downHp = 100;
    rest.forEach((m, i) => { m.x = c.x + 300 + i * 30; m.y = c.y + 200; m.hp = 100; });
    for (let t = 0; t < 2500; t += 16) g.update(16);
    const near = rest.filter((m) => Math.hypot(m.x - down.x, m.y - down.y) < 70);
    expect(near.length).toBe(1);
  });
});

describe('Countdown', () => {
  for (const mode of ['solo', 'duo', 'squad'] as const) {
    it(`${mode}: 15 Sekunden, dann springen alle gleichzeitig`, () => {
      const g = new Game(generateMap(3), undefined, mode);
      expect(g.dropLeft()).toBe(15);
      for (let t = 0; t < 14900; t += 50) g.update(50);
      expect(g.fighters.every((f) => f.phase === 'plane')).toBe(true);
      expect(Math.ceil(g.dropLeft())).toBe(1);
      for (let t = 0; t < 200; t += 50) g.update(50);
      expect(g.fighters.every((f) => f.phase === 'fall')).toBe(true);
    });
  }
});
