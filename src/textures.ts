import Phaser from 'phaser';
import { mulberry32 } from './rng';
import { WEAPONS, TIER_COLORS, WeaponId } from './weapons';
import { ROCK_SIZES } from './mapgen';

export function makeTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const tex = (key: string, w: number, h: number, draw: () => void) => {
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };

  tex('grass', 256, 256, () => {
    const r = mulberry32(7);
    g.fillStyle(0x6aa84f);
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      g.fillStyle(r() < 0.5 ? 0x62a047 : 0x74b558, 0.7);
      g.fillCircle(8 + r() * 240, 8 + r() * 240, 2 + r() * 6);
    }
    g.lineStyle(2, 0x528f3b, 0.7);
    for (let i = 0; i < 90; i++) {
      const x = 4 + r() * 248, y = 8 + r() * 244;
      g.lineBetween(x, y, x + (r() - 0.5) * 5, y - 4 - r() * 4);
    }
  });

  // Kämpfer: weiß, wird eingefärbt (Tint)
  tex('fighter', 44, 44, () => {
    g.fillStyle(0x000000, 0.25);
    g.fillCircle(23, 24, 19);
    g.fillStyle(0xffffff);
    g.fillCircle(22, 22, 18);
    g.lineStyle(3, 0x1e1e28);
    g.strokeCircle(22, 22, 18);
    g.fillStyle(0x1e1e28);
    g.fillCircle(31, 15, 3.5);
    g.fillCircle(31, 29, 3.5);
  });

  for (const id of Object.keys(WEAPONS) as WeaponId[]) {
    const w = WEAPONS[id];
    const h = id === 'shotgun' ? 10 : 8;
    tex(`gun_${id}`, w.length + 4, h + 4, () => {
      g.fillStyle(0x23252b);
      g.fillRoundedRect(2, 2, w.length, h, 2);
      g.fillStyle(TIER_COLORS[w.tier]);
      g.fillRect(6, 2 + h / 2 - 1.5, Math.max(6, w.length * 0.4), 3);
    });
  }

  tex('bullet', 14, 4, () => {
    g.fillStyle(0xfff3b0);
    g.fillRoundedRect(0, 0, 14, 4, 2);
    g.fillStyle(0xffffff);
    g.fillRect(9, 1, 5, 2);
  });

  tex('spark', 8, 8, () => {
    g.fillStyle(0xffffff);
    g.fillCircle(4, 4, 4);
  });

  tex('trunk', 28, 28, () => {
    g.fillStyle(0x6b4a2b);
    g.fillCircle(14, 14, 14);
    g.lineStyle(2, 0x4a321c);
    g.strokeCircle(14, 14, 13);
  });

  tex('canopy', 112, 112, () => {
    g.fillStyle(0x000000, 0.18);
    g.fillCircle(60, 62, 50);
    g.fillStyle(0x2f7a33);
    g.fillCircle(56, 56, 50);
    g.fillStyle(0x3b9140);
    g.fillCircle(46, 46, 30);
    g.fillCircle(70, 52, 26);
    g.fillCircle(56, 72, 26);
    g.fillStyle(0x4daa52, 0.8);
    g.fillCircle(42, 40, 14);
    g.fillCircle(68, 44, 10);
  });

  for (const rad of ROCK_SIZES) {
    tex(`rock_${rad}`, rad * 2, rad * 2, () => {
      g.fillStyle(0x7d828b);
      g.fillCircle(rad, rad, rad);
      g.fillStyle(0x6a6e76);
      g.fillCircle(rad + rad * 0.15, rad + rad * 0.2, rad * 0.8);
      g.fillStyle(0x969ba4);
      g.fillCircle(rad - rad * 0.25, rad - rad * 0.25, rad * 0.45);
      g.lineStyle(3, 0x4f535a);
      g.strokeCircle(rad, rad, rad - 1.5);
    });
  }

  tex('crate', 44, 44, () => {
    g.fillStyle(0xb7843f);
    g.fillRect(0, 0, 44, 44);
    g.lineStyle(4, 0x7a5426);
    g.strokeRect(2, 2, 40, 40);
    g.lineBetween(4, 4, 40, 40);
    g.lineBetween(40, 4, 4, 40);
  });

  tex('bush', 92, 92, () => {
    g.fillStyle(0x245e27);
    g.fillCircle(46, 46, 40);
    g.fillStyle(0x2f7533);
    g.fillCircle(32, 36, 24);
    g.fillCircle(60, 38, 22);
    g.fillCircle(46, 60, 24);
    g.fillStyle(0x3d8c42, 0.9);
    g.fillCircle(30, 30, 10);
    g.fillCircle(58, 30, 8);
    g.fillCircle(50, 56, 9);
  });

  const lootBase = (ring: number) => {
    g.fillStyle(0x000000, 0.3);
    g.fillCircle(21, 22, 18);
    g.fillStyle(0x1d2330, 0.9);
    g.fillCircle(20, 20, 17);
    g.lineStyle(3, ring);
    g.strokeCircle(20, 20, 16);
  };
  tex('loot_ammo', 40, 40, () => {
    lootBase(0xffc107);
    for (let i = 0; i < 3; i++) {
      g.fillStyle(0xffc107);
      g.fillRect(11 + i * 7, 15, 5, 13);
      g.fillStyle(0xd9822b);
      g.fillTriangle(11 + i * 7, 15, 16 + i * 7, 15, 13.5 + i * 7, 10);
    }
  });
  tex('loot_armor', 40, 40, () => {
    lootBase(0x45a3ff);
    g.fillStyle(0x45a3ff);
    g.fillPoints([{ x: 20, y: 9 }, { x: 30, y: 13 }, { x: 28, y: 25 }, { x: 20, y: 31 }, { x: 12, y: 25 }, { x: 10, y: 13 }], true);
    g.fillStyle(0xa9d4ff);
    g.fillPoints([{ x: 20, y: 12 }, { x: 26, y: 15 }, { x: 20, y: 18 }, { x: 14, y: 15 }], true);
  });
  tex('loot_medkit', 40, 40, () => {
    lootBase(0xff5252);
    g.fillStyle(0xffffff);
    g.fillRoundedRect(10, 11, 20, 18, 3);
    g.fillStyle(0xff3b3b);
    g.fillRect(18, 13, 4, 14);
    g.fillRect(13, 18, 14, 4);
  });
  for (const id of Object.keys(WEAPONS) as WeaponId[]) {
    const w = WEAPONS[id];
    tex(`loot_w_${id}`, 40, 40, () => {
      lootBase(TIER_COLORS[w.tier]);
      const len = 12 + w.length * 0.38;
      const x0 = 20 - len / 2;
      g.fillStyle(0xe6e8ec);
      g.fillRect(x0, 16, len, 6);
      g.fillRect(x0 + 2, 20, 5, 9);
      g.fillStyle(TIER_COLORS[w.tier]);
      g.fillRect(x0 + len * 0.45, 17, len * 0.3, 3);
    });
  }

  g.destroy();
}
