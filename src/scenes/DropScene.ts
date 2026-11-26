import Phaser from 'phaser';
import { WORLD } from '../config';
import { generateMap, MapData } from '../mapgen';

const DROP_TIME = 12000;
const font = (size: number, color = '#ffffff') => ({
  fontFamily: 'Arial Black, Arial, sans-serif',
  fontSize: `${size}px`,
  color,
  stroke: '#000000',
  strokeThickness: 4,
  align: 'center' as const,
});

export class DropScene extends Phaser.Scene {
  map!: MapData;
  mapG!: Phaser.GameObjects.Graphics;
  planeG!: Phaser.GameObjects.Graphics;
  title!: Phaser.GameObjects.Text;
  timer!: Phaser.GameObjects.Text;
  ox = 0;
  oy = 0;
  size = 0;
  startAt = 0;
  chosen = false;
  path = { x1: 0, y1: 0, x2: 0, y2: 0 };

  constructor() {
    super('Drop');
  }

  init() {
    this.map = generateMap(Math.floor(Math.random() * 1e9));
    this.chosen = false;
    const flip = Math.random() < 0.5;
    const a = 300 + Math.random() * (WORLD - 600), b = 300 + Math.random() * (WORLD - 600);
    this.path = flip ? { x1: 0, y1: a, x2: WORLD, y2: b } : { x1: a, y1: 0, x2: b, y2: WORLD };
  }

  create() {
    this.startAt = this.time.now;
    this.cameras.main.setBackgroundColor('#16261a');
    this.mapG = this.add.graphics();
    this.planeG = this.add.graphics();
    this.title = this.add.text(0, 0, 'Wähle deinen Landeplatz\nTippe auf die Karte', font(20)).setOrigin(0.5, 0);
    this.timer = this.add.text(0, 0, '', font(16, '#ffd23f')).setOrigin(0.5, 1);
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const x = (p.x - this.ox) / this.size, y = (p.y - this.oy) / this.size;
      if (x < 0 || y < 0 || x > 1 || y > 1) return;
      this.choose(x * WORLD, y * WORLD);
    });
  }

  layout() {
    const { width: w, height: h } = this.scale;
    this.size = Math.min(w - 32, h - 150);
    this.ox = (w - this.size) / 2;
    this.oy = 80 + (h - 150 - this.size) / 2;
    this.title.setPosition(w / 2, 14);
    this.timer.setPosition(w / 2, h - 18);
    this.drawMap();
  }

  drawMap() {
    const g = this.mapG;
    const k = this.size / WORLD, ox = this.ox, oy = this.oy;
    g.clear();
    g.fillStyle(0x000000, 0.5);
    g.fillRect(ox - 4, oy - 4, this.size + 8, this.size + 8);
    g.fillStyle(0x5f9c46);
    g.fillRect(ox, oy, this.size, this.size);
    for (const o of this.map.obstacles) {
      const x = ox + o.x * k, y = oy + o.y * k;
      if (o.kind === 'wall') {
        g.fillStyle(0x9a8c7a);
        g.fillRect(ox + (o.x - o.w / 2) * k, oy + (o.y - o.h / 2) * k, Math.max(1.5, o.w * k), Math.max(1.5, o.h * k));
      } else if (o.kind === 'rock') {
        g.fillStyle(0x7d828b);
        g.fillCircle(x, y, Math.max(1.5, o.r * k));
      } else if (o.kind === 'tree') {
        g.fillStyle(0x2f7a33);
        g.fillCircle(x, y, Math.max(2, 50 * k));
      } else if (o.kind === 'bush') {
        g.fillStyle(0x245e27);
        g.fillCircle(x, y, Math.max(2, o.r * k));
      } else {
        g.fillStyle(0xb7843f);
        g.fillRect(x - 22 * k, y - 22 * k, Math.max(1.5, 44 * k), Math.max(1.5, 44 * k));
      }
    }
    g.lineStyle(2, 0xffffff, 0.35);
    const p = this.path;
    g.lineBetween(ox + p.x1 * k, oy + p.y1 * k, ox + p.x2 * k, oy + p.y2 * k);
    g.lineStyle(2, 0xffffff, 0.8);
    g.strokeRect(ox, oy, this.size, this.size);
  }

  update(time: number) {
    const t = Math.min(1, (time - this.startAt) / DROP_TIME);
    const p = this.path;
    const wx = p.x1 + (p.x2 - p.x1) * t, wy = p.y1 + (p.y2 - p.y1) * t;
    const k = this.size / WORLD;
    const x = this.ox + wx * k, y = this.oy + wy * k;
    const ang = Math.atan2(p.y2 - p.y1, p.x2 - p.x1);
    const g = this.planeG;
    g.clear();
    g.fillStyle(0xffffff);
    const pt = (dx: number, dy: number) => ({ x: x + Math.cos(ang) * dx - Math.sin(ang) * dy, y: y + Math.sin(ang) * dx + Math.cos(ang) * dy });
    g.fillPoints([pt(14, 0), pt(-10, -11), pt(-5, 0), pt(-10, 11)], true);
    if (!this.chosen) {
      this.timer.setText(`Automatischer Absprung in ${Math.ceil((1 - t) * DROP_TIME / 1000)} s`);
      if (t >= 1) this.choose(Phaser.Math.Clamp(wx, 200, WORLD - 200), Phaser.Math.Clamp(wy, 200, WORLD - 200));
    }
  }

  choose(x: number, y: number) {
    if (this.chosen) return;
    this.chosen = true;
    const k = this.size / WORLD;
    const g = this.add.graphics();
    g.lineStyle(4, 0xffd23f);
    const sx = this.ox + x * k, sy = this.oy + y * k;
    g.strokeCircle(sx, sy, 12);
    g.lineBetween(sx - 18, sy, sx + 18, sy);
    g.lineBetween(sx, sy - 18, sx, sy + 18);
    this.timer.setText('Absprung!');
    this.time.delayedCall(450, () => this.scene.start('Game', { map: this.map, landX: x, landY: y }));
  }
}
