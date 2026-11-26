import Phaser from 'phaser';
import { WORLD, FIGHTER_COUNT, FIGHTER_R, PLAYER_SPEED, BOT_SPEED } from '../config';
import { WEAPONS, WeaponId } from '../weapons';
import { MapData, LootKind, Obs } from '../mapgen';
import { Fighter } from '../fighter';
import { botNames, BODY_COLORS, PLAYER_COLOR } from '../names';
import { recordResult } from '../storage';

interface Obstacle {
  kind: Obs['kind'];
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  rect: Phaser.Geom.Rectangle;
  hp: number;
  dead: boolean;
  stamp: number;
}
export interface Loot { img: Phaser.GameObjects.Image; kind: LootKind; x: number; y: number; taken: boolean }
interface Bullet {
  img: Phaser.GameObjects.Image;
  x: number; y: number; vx: number; vy: number;
  owner: Fighter; dmg: number; traveled: number; range: number; weapon: string;
}
interface Decor { img: Phaser.GameObjects.Image; x: number; y: number; r: number }
export interface Circle { x: number; y: number; r: number }
export interface UIInput { joyX: number; joyY: number; heal: boolean; reload: boolean; pickup: boolean }
export interface GameResult { win: boolean; place: number; kills: number; time: number }
export interface KillEvent { killer: string; victim: string; weapon: string; mine: boolean; me: boolean }

export const PHASES = [
  { wait: 35000, shrink: 25000, r: 1150, dps: 2 },
  { wait: 25000, shrink: 20000, r: 720, dps: 4 },
  { wait: 20000, shrink: 18000, r: 420, dps: 6 },
  { wait: 15000, shrink: 15000, r: 200, dps: 9 },
  { wait: 10000, shrink: 12000, r: 0, dps: 14 },
];
export const GRACE = 3000;
const CELL = 160;
const GRID = Math.ceil(WORLD / CELL);
const PICKUP_R = 32;

const lootLabel = (k: LootKind) =>
  k === 'ammo' ? 'Munition' : k === 'armor' ? 'Rüstung' : k === 'medkit' ? 'Medikit' : WEAPONS[k.slice(2) as WeaponId].name;

export class GameScene extends Phaser.Scene {
  map!: MapData;
  landX = 0;
  landY = 0;
  fighters: Fighter[] = [];
  player!: Fighter;
  obstacles: Obstacle[] = [];
  grid: Obstacle[][] = [];
  queryStamp = 0;
  loot: Loot[] = [];
  bullets: Bullet[] = [];
  bushes: Decor[] = [];
  canopies: Decor[] = [];
  obstacleGroup!: Phaser.Physics.Arcade.StaticGroup;
  fighterGroup!: Phaser.Physics.Arcade.Group;
  zoneCur: Circle = { x: 0, y: 0, r: 0 };
  zoneNext: Circle = { x: 0, y: 0, r: 0 };
  zoneFrom: Circle = { x: 0, y: 0, r: 0 };
  phase = 0;
  phaseStart = 0;
  zoneState: 'wait' | 'shrink' | 'done' = 'wait';
  nextZoneTick = 0;
  nextPickup = 0;
  gfxZone!: Phaser.GameObjects.Graphics;
  gfxBars!: Phaser.GameObjects.Graphics;
  gfxUnder!: Phaser.GameObjects.Graphics;
  startTime = 0;
  over = false;
  result: GameResult | null = null;
  ui: UIInput = { joyX: 0, joyY: 0, heal: false, reload: false, pickup: false };
  nearbyWeapon: Loot | null = null;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  line = new Phaser.Geom.Line();

  constructor() {
    super('Game');
  }

  init(data: { map: MapData; landX: number; landY: number }) {
    this.map = data.map;
    this.landX = data.landX;
    this.landY = data.landY;
    this.fighters = [];
    this.obstacles = [];
    this.grid = Array.from({ length: GRID * GRID }, () => []);
    this.loot = [];
    this.bullets = [];
    this.bushes = [];
    this.canopies = [];
    this.phase = 0;
    this.zoneState = 'wait';
    this.over = false;
    this.result = null;
    this.ui = { joyX: 0, joyY: 0, heal: false, reload: false, pickup: false };
    this.nearbyWeapon = null;
    this.nextZoneTick = 0;
    this.nextPickup = 0;
  }

  create() {
    const now = this.time.now;
    this.startTime = now;
    this.physics.world.setBounds(0, 0, WORLD, WORLD);
    this.cameras.main.setBackgroundColor('#23401f');

    for (let x = 0; x < WORLD; x += 256) {
      for (let y = 0; y < WORLD; y += 256) {
        this.add.image(x, y, 'grass').setOrigin(0).setDepth(-10);
      }
    }
    const border = this.add.graphics().setDepth(-9);
    border.lineStyle(10, 0x2d4a22, 1);
    border.strokeRect(0, 0, WORLD, WORLD);

    this.obstacleGroup = this.physics.add.staticGroup();
    this.fighterGroup = this.physics.add.group();
    for (const o of this.map.obstacles) this.buildObstacle(o);
    for (const l of this.map.loot) this.spawnLoot(l.x, l.y, l.kind, false);

    this.gfxUnder = this.add.graphics().setDepth(5);
    this.gfxZone = this.add.graphics().setDepth(50);
    this.gfxBars = this.add.graphics().setDepth(60);

    // Spieler + Bots
    const start = this.findFreeNear(this.landX, this.landY);
    this.player = this.createFighter('Du', true, PLAYER_COLOR, start.x, start.y);
    const names = botNames(FIGHTER_COUNT - 1);
    for (let i = 0; i < FIGHTER_COUNT - 1; i++) {
      const p = this.randomSpawn();
      const bot = this.createFighter(names[i], false, BODY_COLORS[i % BODY_COLORS.length], p.x, p.y);
      bot.medkits = Math.random() < 0.3 ? 1 : 0;
      bot.strafe = Math.random() < 0.5 ? 1 : -1;
    }
    this.physics.add.collider(this.fighterGroup, this.obstacleGroup);

    // Zone
    this.zoneCur = { x: WORLD / 2, y: WORLD / 2, r: WORLD * 0.72 };
    this.zoneNext = this.computeNext(this.zoneCur, PHASES[0].r);
    this.phaseStart = now;

    const cam = this.cameras.main;
    cam.setBounds(-500, -500, WORLD + 1000, WORLD + 1000);
    cam.startFollow(this.player.sprite, true, 0.12, 0.12);
    cam.setZoom(this.computeZoom());
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,H,R,E') as Record<string, Phaser.Input.Keyboard.Key>;

    this.scene.launch('UI');
  }

  onResize() {
    this.cameras.main.setZoom(this.computeZoom());
  }

  computeZoom() {
    const { width, height } = this.scale;
    return Phaser.Math.Clamp(Math.min(width, height) / 820, 0.5, 1.1);
  }

  // ---------- Aufbau ----------

  buildObstacle(o: Obs) {
    if (o.kind === 'bush') {
      const img = this.add.image(o.x, o.y, 'bush').setDepth(30).setAlpha(0.96);
      this.bushes.push({ img, x: o.x, y: o.y, r: o.r });
      return;
    }
    let obj: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
    let rect: Phaser.Geom.Rectangle;
    if (o.kind === 'wall') {
      const r = this.add.rectangle(o.x, o.y, o.w, o.h, 0x9a8c7a).setStrokeStyle(3, 0x5e554b).setDepth(9);
      this.physics.add.existing(r, true);
      this.obstacleGroup.add(r);
      obj = r;
      rect = new Phaser.Geom.Rectangle(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
    } else if (o.kind === 'crate') {
      const img = this.obstacleGroup.create(o.x, o.y, 'crate') as Phaser.Physics.Arcade.Image;
      img.setDepth(9);
      obj = img;
      rect = new Phaser.Geom.Rectangle(o.x - 22, o.y - 22, 44, 44);
    } else {
      const key = o.kind === 'rock' ? `rock_${o.r}` : 'trunk';
      const img = this.obstacleGroup.create(o.x, o.y, key) as Phaser.Physics.Arcade.Image;
      (img.body as Phaser.Physics.Arcade.StaticBody).setCircle(o.r);
      img.setDepth(9);
      obj = img;
      const s = o.r * 0.82;
      rect = new Phaser.Geom.Rectangle(o.x - s, o.y - s, s * 2, s * 2);
      if (o.kind === 'tree') {
        const c = this.add.image(o.x, o.y, 'canopy').setDepth(40);
        this.canopies.push({ img: c, x: o.x, y: o.y, r: 52 });
      }
    }
    const ob: Obstacle = { kind: o.kind, obj, rect, hp: 45, dead: false, stamp: 0 };
    obj.setData('obs', ob);
    this.obstacles.push(ob);
    const c0 = Phaser.Math.Clamp(Math.floor(rect.x / CELL), 0, GRID - 1);
    const c1 = Phaser.Math.Clamp(Math.floor(rect.right / CELL), 0, GRID - 1);
    const r0 = Phaser.Math.Clamp(Math.floor(rect.y / CELL), 0, GRID - 1);
    const r1 = Phaser.Math.Clamp(Math.floor(rect.bottom / CELL), 0, GRID - 1);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) this.grid[cy * GRID + cx].push(ob);
  }

  /** Läuft über alle Hindernisse im Bereich; gibt true zurück, sobald cb true liefert. */
  query(x0: number, y0: number, x1: number, y1: number, cb: (o: Obstacle) => boolean): boolean {
    const stamp = ++this.queryStamp;
    const c0 = Phaser.Math.Clamp(Math.floor(x0 / CELL), 0, GRID - 1);
    const c1 = Phaser.Math.Clamp(Math.floor(x1 / CELL), 0, GRID - 1);
    const r0 = Phaser.Math.Clamp(Math.floor(y0 / CELL), 0, GRID - 1);
    const r1 = Phaser.Math.Clamp(Math.floor(y1 / CELL), 0, GRID - 1);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        for (const o of this.grid[cy * GRID + cx]) {
          if (o.dead || o.stamp === stamp) continue;
          o.stamp = stamp;
          if (cb(o)) return true;
        }
      }
    }
    return false;
  }

  hasLOS(x1: number, y1: number, x2: number, y2: number) {
    this.line.setTo(x1, y1, x2, y2);
    return !this.query(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2), (o) =>
      Phaser.Geom.Intersects.LineToRectangle(this.line, o.rect),
    );
  }

  isFree(x: number, y: number, pad = 26) {
    if (x < 80 || y < 80 || x > WORLD - 80 || y > WORLD - 80) return false;
    return !this.query(x - pad, y - pad, x + pad, y + pad, (o) =>
      x > o.rect.x - pad && x < o.rect.right + pad && y > o.rect.y - pad && y < o.rect.bottom + pad,
    );
  }

  findFreeNear(x: number, y: number) {
    x = Phaser.Math.Clamp(x, 100, WORLD - 100);
    y = Phaser.Math.Clamp(y, 100, WORLD - 100);
    for (let r = 0; r < 600; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (this.isFree(px, py)) return { x: px, y: py };
        if (r === 0) break;
      }
    }
    return { x, y };
  }

  randomSpawn() {
    for (let i = 0; i < 400; i++) {
      const x = 150 + Math.random() * (WORLD - 300), y = 150 + Math.random() * (WORLD - 300);
      if (!this.isFree(x, y)) continue;
      const tooClose = this.fighters.some((f) => {
        const min = f.isPlayer ? 500 : 320;
        return (f.x - x) ** 2 + (f.y - y) ** 2 < min * min;
      });
      if (!tooClose) return { x, y };
    }
    return this.findFreeNear(Math.random() * WORLD, Math.random() * WORLD);
  }

  createFighter(name: string, isPlayer: boolean, color: number, x: number, y: number) {
    const f = new Fighter(name, isPlayer, color);
    const s = this.fighterGroup.create(x, y, 'fighter') as Phaser.Physics.Arcade.Sprite;
    s.setCircle(FIGHTER_R, 22 - FIGHTER_R, 22 - FIGHTER_R);
    s.setCollideWorldBounds(true);
    s.setTint(color);
    s.setDepth(isPlayer ? 11 : 10);
    f.sprite = s;
    f.gun = this.add.image(x, y, 'gun_pistol').setOrigin(0, 0.5).setDepth(s.depth + 0.5);
    if (!isPlayer) {
      f.label = this.add
        .text(x, y - 48, name, { fontFamily: 'Arial', fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(61);
    }
    f.aim = Math.random() * Math.PI * 2;
    f.lastX = x;
    f.lastY = y;
    this.fighters.push(f);
    // Landung
    s.setScale(2.4).setAlpha(0);
    this.tweens.add({ targets: s, scale: 1, alpha: 1, duration: 700, ease: 'Quad.easeIn' });
    return f;
  }

  spawnLoot(x: number, y: number, kind: LootKind, pop: boolean) {
    x = Phaser.Math.Clamp(x, 40, WORLD - 40);
    y = Phaser.Math.Clamp(y, 40, WORLD - 40);
    const key = kind.startsWith('w:') ? `loot_w_${kind.slice(2)}` : `loot_${kind}`;
    const img = this.add.image(x, y, key).setDepth(8);
    if (pop) {
      img.setScale(0);
      this.tweens.add({ targets: img, scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
    const l: Loot = { img, kind, x, y, taken: false };
    this.loot.push(l);
    return l;
  }

  computeNext(cur: Circle, r: number): Circle {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * Math.max(0, cur.r - r) * 0.85;
    const lim = Math.max(150, r * 0.6);
    return {
      x: Phaser.Math.Clamp(cur.x + Math.cos(a) * d, lim, WORLD - lim),
      y: Phaser.Math.Clamp(cur.y + Math.sin(a) * d, lim, WORLD - lim),
      r,
    };
  }

  // ---------- Hauptschleife ----------

  update(time: number, delta: number) {
    if (!this.player) return;
    const now = time;
    const dt = Math.min(delta, 50) / 1000;

    this.updateZone(now);
    if (this.player.alive && !this.over) this.handlePlayer(now);
    else this.player.sprite.setVelocity(0, 0);

    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (!f.isPlayer) {
        if (now >= f.nextThink) this.think(f, now);
        const sp = BOT_SPEED * (f.healUntil ? 0.5 : 1);
        f.sprite.setVelocity(f.moveX * sp, f.moveY * sp);
      }
      this.updateCombat(f, now);
    }
    this.updateBullets(dt);
    if (now >= this.nextPickup) {
      this.nextPickup = now + 100;
      this.updatePickups();
    }
    if (now >= this.nextZoneTick) {
      this.nextZoneTick = now + 500;
      this.zoneDamage();
    }
    this.updateCover(now);
    this.drawOverlays(now);
  }

  handlePlayer(now: number) {
    const f = this.player;
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.A.isDown || k.LEFT.isDown) mx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) mx += 1;
    if (k.W.isDown || k.UP.isDown) my -= 1;
    if (k.S.isDown || k.DOWN.isDown) my += 1;
    mx += this.ui.joyX;
    my += this.ui.joyY;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const speed = PLAYER_SPEED * (f.healUntil ? 0.5 : 1);
    f.sprite.setVelocity(mx * speed, my * speed);
    f.moveX = mx;
    f.moveY = my;

    const JD = Phaser.Input.Keyboard.JustDown;
    if (JD(k.H) || this.ui.heal) this.startHeal(f, now);
    if (JD(k.R) || this.ui.reload) this.startReload(f, now);
    if ((JD(k.E) || this.ui.pickup) && this.nearbyWeapon && !this.nearbyWeapon.taken) {
      this.tryPickup(f, this.nearbyWeapon, true);
      this.nearbyWeapon = null;
    }
    this.ui.heal = this.ui.reload = this.ui.pickup = false;
  }

  updateCombat(f: Fighter, now: number) {
    if (f.reloading && now >= f.reloadUntil) {
      const take = Math.min(f.weapon.mag - f.mag, f.ammo);
      f.mag += take;
      f.ammo -= take;
      f.reloading = false;
    }
    if (f.healUntil && now >= f.healUntil) {
      f.healUntil = 0;
      f.hp = Math.min(100, f.hp + 50);
      if (f.isPlayer) this.floatText(f.x, f.y - 40, '+50', '#5dff7a');
    }
    if (now >= f.nextScan) {
      f.nextScan = now + 140 + Math.random() * 80;
      const t = this.findTarget(f, now);
      if (t !== f.target) {
        f.target = t;
        f.targetSince = now;
      }
    }
    if (f.target && !f.target.alive) f.target = null;

    if (f.target) {
      const ang = Math.atan2(f.target.y - f.y, f.target.x - f.x);
      f.aim = Phaser.Math.Angle.RotateTo(f.aim, ang + (f.isPlayer ? 0 : f.aimError), 0.35);
    } else if (f.moveX || f.moveY) {
      f.aim = Phaser.Math.Angle.RotateTo(f.aim, Math.atan2(f.moveY, f.moveX), 0.2);
    }

    const canFire =
      f.target && now - this.startTime > GRACE && !f.healUntil && (f.isPlayer || now - f.targetSince > 550);
    if (canFire) this.tryFire(f, now);
    else if (!f.target && f.mag < f.weapon.mag && f.ammo > 0 && now - f.lastShot > 1500) this.startReload(f, now);

    f.sprite.setRotation(f.aim);
    f.gun.setPosition(f.x + Math.cos(f.aim) * 10, f.y + Math.sin(f.aim) * 10).setRotation(f.aim);
    if (f.label) f.label.setPosition(f.x, f.y - 50);
  }

  findTarget(f: Fighter, now: number): Fighter | null {
    let best: Fighter | null = null;
    // Bots greifen erst etwas näher an als die maximale Reichweite
    let bestD = f.weapon.range * (f.isPlayer ? 1 : 0.85);
    for (const o of this.fighters) {
      if (o === f || !o.alive) continue;
      const d = Math.hypot(o.x - f.x, o.y - f.y);
      if (d >= bestD) continue;
      if (o.inBush && d > 140 && now - o.lastFiredAt > 900) continue;
      if (!this.hasLOS(f.x, f.y, o.x, o.y)) continue;
      best = o;
      bestD = d;
    }
    return best;
  }

  tryFire(f: Fighter, now: number) {
    const w = f.weapon;
    if (f.reloading || now - f.lastShot < w.rate) return;
    if (f.mag <= 0) {
      this.startReload(f, now);
      return;
    }
    f.mag--;
    f.lastShot = now;
    f.lastFiredAt = now;
    const extra = f.isPlayer ? 0 : 0.16;
    const sx = f.x + Math.cos(f.aim) * 20, sy = f.y + Math.sin(f.aim) * 20;
    for (let i = 0; i < w.pellets; i++) {
      const a = f.aim + (Math.random() - 0.5) * 2 * (w.spread + extra);
      const img = this.add.image(sx, sy, 'bullet').setRotation(a).setDepth(12);
      if (w.id === 'shotgun') img.setScale(0.7);
      this.bullets.push({
        img, x: sx, y: sy,
        vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        owner: f, dmg: w.damage, traveled: 0, range: w.range * 1.1, weapon: w.name,
      });
    }
    if (!f.isPlayer) f.aimError = (Math.random() - 0.5) * 0.4;
    const mx = f.x + Math.cos(f.aim) * (w.length + 12), my = f.y + Math.sin(f.aim) * (w.length + 12);
    if (this.inView(mx, my)) {
      const fl = this.add.image(mx, my, 'spark').setDepth(13).setTint(0xffe27a).setScale(1.6);
      this.tweens.add({ targets: fl, scale: 0.2, alpha: 0, duration: 80, onComplete: () => fl.destroy() });
    }
    if (f.mag === 0) this.startReload(f, now);
  }

  startReload(f: Fighter, now: number) {
    if (f.reloading || f.ammo <= 0 || f.mag >= f.weapon.mag) return;
    f.reloading = true;
    f.reloadUntil = now + f.weapon.reload;
  }

  startHeal(f: Fighter, now: number) {
    if (f.healUntil || f.medkits <= 0 || f.hp >= 100) return;
    f.medkits--;
    f.healUntil = now + 2000;
  }

  updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const dx = b.vx * dt, dy = b.vy * dt;
      const nx = b.x + dx, ny = b.y + dy;
      const seg2 = dx * dx + dy * dy || 1;
      const segLen = Math.sqrt(seg2);
      let hitT = 1;
      let hitF: Fighter | null = null;
      let hitO: Obstacle | null = null;

      for (const f of this.fighters) {
        if (!f.alive || f === b.owner) continue;
        const t = Phaser.Math.Clamp(((f.x - b.x) * dx + (f.y - b.y) * dy) / seg2, 0, 1);
        const cx = b.x + dx * t - f.x, cy = b.y + dy * t - f.y;
        if (cx * cx + cy * cy <= (FIGHTER_R + 3) ** 2 && t < hitT) {
          hitT = t;
          hitF = f;
        }
      }
      this.line.setTo(b.x, b.y, nx, ny);
      this.query(Math.min(b.x, nx), Math.min(b.y, ny), Math.max(b.x, nx), Math.max(b.y, ny), (o) => {
        if (!Phaser.Geom.Intersects.LineToRectangle(this.line, o.rect)) return false;
        const pts = Phaser.Geom.Intersects.GetLineToRectangle(this.line, o.rect);
        let t = 0;
        if (pts.length) t = Math.min(...pts.map((p) => Math.hypot(p.x - b.x, p.y - b.y) / segLen));
        if (t < hitT) {
          hitT = t;
          hitO = o;
          hitF = null;
        }
        return false;
      });

      const hx = b.x + dx * hitT, hy = b.y + dy * hitT;
      if (hitF) {
        this.damage(hitF, b.dmg, b.owner, false, b.weapon);
        this.sparks(hx, hy, (hitF as Fighter).color, 3);
      } else if (hitO) {
        const o = hitO as Obstacle;
        this.sparks(hx, hy, 0xd8d0c0, 2);
        if (o.kind === 'crate') this.hitCrate(o, b.dmg);
      } else {
        b.x = nx;
        b.y = ny;
        b.traveled += segLen;
        b.img.setPosition(nx, ny);
        if (b.traveled < b.range) continue;
      }
      b.img.destroy();
      this.bullets.splice(i, 1);
    }
  }

  hitCrate(o: Obstacle, dmg: number) {
    o.hp -= dmg;
    const img = o.obj as Phaser.GameObjects.Image;
    img.setTintFill(0xffffff);
    this.time.delayedCall(60, () => img.active && img.clearTint());
    if (o.hp > 0) return;
    o.dead = true;
    const { x, y } = img;
    this.sparks(x, y, 0xb7843f, 10);
    this.obstacleGroup.remove(img, true, true);
    const n = 1 + (Math.random() < 0.5 ? 1 : 0);
    const kinds: LootKind[] = ['w:smg', 'w:shotgun', 'w:rifle', 'w:sniper', 'armor', 'medkit', 'ammo'];
    for (let i = 0; i < n; i++) {
      const k = kinds[Math.floor(Math.random() * kinds.length)];
      this.spawnLoot(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, k, true);
    }
  }

  damage(f: Fighter, amount: number, attacker: Fighter | null, ignoreArmor: boolean, weapon: string) {
    if (!f.alive) return;
    let dmg = amount;
    if (!ignoreArmor && f.armor > 0) {
      const a = Math.min(f.armor, dmg * 0.6);
      f.armor -= a;
      dmg -= a;
    }
    f.hp -= dmg;
    if (attacker) {
      f.lastAttacker = attacker;
      f.lastHitAt = this.time.now;
    }
    f.sprite.setTintFill(0xffffff);
    this.time.delayedCall(70, () => f.alive && f.sprite.setTint(f.color));
    if (attacker === this.player) this.floatText(f.x, f.y - 30, String(Math.round(amount)), '#ffffff');
    if (f === this.player) {
      this.floatText(f.x, f.y - 30, `-${Math.round(dmg)}`, '#ff5a5a');
      if (!ignoreArmor) this.cameras.main.shake(90, 0.004);
    }
    if (f.hp <= 0) this.kill(f, attacker, weapon);
  }

  kill(f: Fighter, attacker: Fighter | null, weapon: string) {
    f.alive = false;
    f.hp = 0;
    f.target = null;
    f.sprite.setVelocity(0, 0);
    (f.sprite.body as Phaser.Physics.Arcade.Body).enable = false;
    if (attacker) attacker.kills++;

    const drops: LootKind[] = [];
    if (f.weapon.id !== 'pistol') drops.push(`w:${f.weapon.id}` as LootKind);
    if (f.ammo >= 15) drops.push('ammo');
    for (let i = 0; i < Math.min(2, f.medkits); i++) drops.push('medkit');
    if (f.armor >= 25) drops.push('armor');
    const off = Math.random() * Math.PI;
    drops.forEach((k, i) => {
      const a = off + (i / drops.length) * Math.PI * 2;
      this.spawnLoot(f.x + Math.cos(a) * 30, f.y + Math.sin(a) * 30, k, true);
    });

    this.sparks(f.x, f.y, f.color, 14);
    this.tweens.add({
      targets: [f.sprite, f.gun],
      alpha: 0,
      scale: 0.4,
      duration: 350,
      onComplete: () => {
        f.sprite.setVisible(false);
        f.gun.setVisible(false);
      },
    });
    f.label?.setVisible(false);

    const alive = this.aliveCount();
    const ev: KillEvent = {
      killer: attacker ? attacker.name : 'Zone',
      victim: f.name,
      weapon: attacker ? weapon : 'Zone',
      mine: attacker === this.player,
      me: f === this.player,
    };
    this.events.emit('kill', ev);
    if (attacker === this.player && f !== this.player) this.events.emit('toast', `${f.name} eliminiert!`, '#ffd23f');
    if (f === this.player) this.endGame(false, alive + 1);
    else if (alive === 1 && this.player.alive) this.endGame(true, 1);
  }

  endGame(win: boolean, place: number) {
    if (this.over) return;
    this.over = true;
    this.result = { win, place, kills: this.player.kills, time: this.time.now - this.startTime };
    recordResult(place, this.player.kills, win);
    this.events.emit('gameover', this.result);
  }

  aliveCount() {
    let n = 0;
    for (const f of this.fighters) if (f.alive) n++;
    return n;
  }

  // ---------- Bots ----------

  safeCircle(now: number): Circle {
    if (this.zoneState === 'shrink') return this.zoneNext;
    if (this.zoneState === 'wait' && PHASES[this.phase].wait - (now - this.phaseStart) < 12000) return this.zoneNext;
    return this.zoneCur;
  }

  think(f: Fighter, now: number) {
    f.nextThink = now + 220 + Math.random() * 120;
    const safe = this.safeCircle(now);
    const dSafe = Math.hypot(safe.x - f.x, safe.y - f.y) || 1;
    const outside = dSafe > Math.max(40, safe.r * 0.8);
    const t = f.target;
    let dx = 0, dy = 0;

    if (!t && f.hp < 65 && f.medkits > 0) this.startHeal(f, now);
    if (f.lootTarget && (f.lootTarget.taken || now > f.lootUntil)) f.lootTarget = null;

    if (t) {
      const ang = Math.atan2(t.y - f.y, t.x - f.x);
      const d = Math.hypot(t.x - f.x, t.y - f.y);
      if (f.hp < 30 && t.hp > f.hp + 15) {
        dx = -Math.cos(ang);
        dy = -Math.sin(ang);
      } else {
        const pref = f.weapon.range * 0.55;
        const radial = d > pref + 50 ? 1 : d < pref - 50 ? -0.8 : 0;
        if (Math.random() < 0.12) f.strafe *= -1;
        dx = Math.cos(ang) * radial + Math.cos(ang + Math.PI / 2) * f.strafe * 0.9;
        dy = Math.sin(ang) * radial + Math.sin(ang + Math.PI / 2) * f.strafe * 0.9;
      }
      if (outside) {
        dx += ((safe.x - f.x) / dSafe) * 1.5;
        dy += ((safe.y - f.y) / dSafe) * 1.5;
      }
    } else if (outside) {
      dx = (safe.x - f.x) / dSafe;
      dy = (safe.y - f.y) / dSafe;
    } else if (f.lastAttacker && f.lastAttacker.alive && now - f.lastHitAt < 2500) {
      dx = f.lastAttacker.x - f.x;
      dy = f.lastAttacker.y - f.y;
    } else {
      if (!f.lootTarget) {
        const l = this.findUsefulLoot(f, safe);
        if (l) {
          f.lootTarget = l;
          f.lootUntil = now + 6000;
        }
      }
      if (f.lootTarget) {
        dx = f.lootTarget.x - f.x;
        dy = f.lootTarget.y - f.y;
      } else {
        if (now > f.wanderUntil || Math.hypot(f.wanderX - f.x, f.wanderY - f.y) < 60) {
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * safe.r * 0.7;
          f.wanderX = Phaser.Math.Clamp(safe.x + Math.cos(a) * rr, 120, WORLD - 120);
          f.wanderY = Phaser.Math.Clamp(safe.y + Math.sin(a) * rr, 120, WORLD - 120);
          f.wanderUntil = now + 4000 + Math.random() * 4000;
        }
        dx = f.wanderX - f.x;
        dy = f.wanderY - f.y;
      }
    }

    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }
    const moved = Math.hypot(f.x - f.lastX, f.y - f.lastY);
    if (len > 0 && moved < 6 && now > f.avoidUntil) {
      f.avoidUntil = now + 600 + Math.random() * 500;
      f.avoidAngle = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * 0.6);
      f.lootTarget = null;
      f.wanderUntil = 0;
    }
    f.lastX = f.x;
    f.lastY = f.y;
    if (now < f.avoidUntil && len > 0) {
      const a = Math.atan2(dy, dx) + f.avoidAngle;
      dx = Math.cos(a);
      dy = Math.sin(a);
    }
    f.moveX = dx;
    f.moveY = dy;
  }

  isUseful(f: Fighter, k: LootKind) {
    if (k === 'ammo') return f.ammo < 90;
    if (k === 'armor') return f.armor < 100;
    if (k === 'medkit') return f.medkits < 3;
    return WEAPONS[k.slice(2) as WeaponId].tier > f.weapon.tier;
  }

  findUsefulLoot(f: Fighter, safe: Circle): Loot | null {
    let best: Loot | null = null;
    let bestD = 700 * 700;
    for (const l of this.loot) {
      if (l.taken || !this.isUseful(f, l.kind)) continue;
      const d = (l.x - f.x) ** 2 + (l.y - f.y) ** 2;
      if (d >= bestD) continue;
      if ((l.x - safe.x) ** 2 + (l.y - safe.y) ** 2 > safe.r * safe.r) continue;
      best = l;
      bestD = d;
    }
    return best;
  }

  // ---------- Loot ----------

  updatePickups() {
    this.nearbyWeapon = null;
    let nearD = 36 * 36;
    for (const l of this.loot) {
      if (l.taken) continue;
      for (const f of this.fighters) {
        if (!f.alive) continue;
        const d2 = (f.x - l.x) ** 2 + (f.y - l.y) ** 2;
        if (d2 > PICKUP_R * PICKUP_R) continue;
        if (this.tryPickup(f, l, false)) break;
        if (f.isPlayer && l.kind.startsWith('w:') && d2 < nearD) {
          nearD = d2;
          this.nearbyWeapon = l;
        }
      }
    }
    this.loot = this.loot.filter((l) => !l.taken);
  }

  tryPickup(f: Fighter, l: Loot, manual: boolean): boolean {
    const k = l.kind;
    if (k === 'ammo') {
      if (f.ammo >= 150) return false;
      f.ammo = Math.min(180, f.ammo + 40);
    } else if (k === 'armor') {
      if (f.armor >= 100) return false;
      f.armor = Math.min(100, f.armor + 50);
    } else if (k === 'medkit') {
      if (f.medkits >= 3) return false;
      f.medkits++;
    } else {
      const w = WEAPONS[k.slice(2) as WeaponId];
      if (!manual && w.tier <= f.weapon.tier) return false;
      const old = f.weapon;
      f.weapon = w;
      f.mag = w.mag;
      f.reloading = false;
      f.gun.setTexture(`gun_${w.id}`);
      if (old.id !== 'pistol' || manual) this.spawnLoot(l.x + 6, l.y + 6, `w:${old.id}` as LootKind, true);
    }
    l.taken = true;
    this.tweens.add({ targets: l.img, scale: 0, alpha: 0, duration: 140, onComplete: () => l.img.destroy() });
    if (f.isPlayer) this.events.emit('toast', `+ ${lootLabel(k)}`, '#ffffff');
    return true;
  }

  // ---------- Zone ----------

  updateZone(now: number) {
    if (this.zoneState === 'done') return;
    const p = PHASES[this.phase];
    if (this.zoneState === 'wait' && now - this.phaseStart >= p.wait) {
      this.zoneState = 'shrink';
      this.zoneFrom = { ...this.zoneCur };
      this.phaseStart = now;
      this.events.emit('toast', 'Die Zone schrumpft!', '#7fb2ff');
    }
    if (this.zoneState === 'shrink') {
      const t = Math.min(1, (now - this.phaseStart) / p.shrink);
      const a = this.zoneFrom, b = this.zoneNext;
      this.zoneCur = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: a.r + (b.r - a.r) * t };
      if (t >= 1) {
        this.phase++;
        if (this.phase >= PHASES.length) {
          this.phase = PHASES.length - 1;
          this.zoneState = 'done';
        } else {
          this.zoneState = 'wait';
          this.phaseStart = now;
          this.zoneNext = this.computeNext(this.zoneCur, PHASES[this.phase].r);
        }
      }
    }
  }

  zoneDamage() {
    const dps = PHASES[this.phase].dps * (this.zoneState === 'done' ? 1.5 : 1);
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (Math.hypot(f.x - this.zoneCur.x, f.y - this.zoneCur.y) > this.zoneCur.r) this.damage(f, dps * 0.5, null, true, 'Zone');
    }
  }

  zoneInfo(now: number) {
    if (this.zoneState === 'wait') {
      const ms = Math.max(0, PHASES[this.phase].wait - (now - this.phaseStart));
      const s = Math.ceil(ms / 1000);
      return { text: `Zone schrumpft in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, urgent: ms < 10000 };
    }
    if (this.zoneState === 'shrink') return { text: 'Zone schrumpft!', urgent: true };
    return { text: 'Letzte Zone!', urgent: true };
  }

  playerOutside() {
    const p = this.player;
    return p.alive && Math.hypot(p.x - this.zoneCur.x, p.y - this.zoneCur.y) > this.zoneCur.r;
  }

  // ---------- Darstellung ----------

  updateCover(now: number) {
    const p = this.player;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      f.inBush = false;
      for (const b of this.bushes) {
        if ((f.x - b.x) ** 2 + (f.y - b.y) ** 2 < (b.r * 0.72) ** 2) {
          f.inBush = true;
          break;
        }
      }
      const hidden =
        !f.isPlayer && f.inBush && now - f.lastFiredAt > 900 && (!p.alive || Math.hypot(f.x - p.x, f.y - p.y) > 140);
      if (hidden !== f.hidden) {
        f.hidden = hidden;
        f.sprite.setAlpha(hidden ? 0 : 1);
        f.gun.setAlpha(hidden ? 0 : 1);
        f.label?.setVisible(!hidden);
      }
    }
    for (const b of this.bushes) {
      const inside = p.alive && (p.x - b.x) ** 2 + (p.y - b.y) ** 2 < (b.r * 0.9) ** 2;
      b.img.setAlpha(inside ? 0.55 : 0.96);
    }
    for (const c of this.canopies) {
      const under = (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < (c.r * 1.05) ** 2;
      c.img.setAlpha(under ? 0.35 : 1);
    }
  }

  inView(x: number, y: number, m = 60) {
    const v = this.cameras.main.worldView;
    return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
  }

  drawOverlays(now: number) {
    // Zone: Außenbereich als Fläche mit Loch
    const z = this.gfxZone;
    z.clear();
    const c = this.zoneCur;
    const pts: { x: number; y: number }[] = [];
    const N = 72;
    for (let i = 0; i <= N; i++) {
      const a = -(i / N) * Math.PI * 2;
      pts.push({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r });
    }
    const L = Math.min(-2000, c.x - c.r - 50), T = Math.min(-2000, c.y - c.r - 50);
    const R = Math.max(WORLD + 2000, c.x + c.r + 50), B = Math.max(WORLD + 2000, c.y + c.r + 50);
    pts.push({ x: R, y: c.y }, { x: R, y: B }, { x: L, y: B }, { x: L, y: T }, { x: R, y: T }, { x: R, y: c.y });
    z.fillStyle(0x2848c8, 0.32);
    z.fillPoints(pts, true);
    z.lineStyle(5, 0x7fb2ff, 0.95);
    z.strokeCircle(c.x, c.y, c.r);
    if (this.zoneState !== 'done' && this.zoneNext.r > 0) {
      z.lineStyle(3, 0xffffff, 0.75);
      z.strokeCircle(this.zoneNext.x, this.zoneNext.y, this.zoneNext.r);
    }

    // Unter den Figuren: Spielerring, Reichweite, Ziel
    const u = this.gfxUnder;
    u.clear();
    const p = this.player;
    if (p.alive) {
      u.lineStyle(2, 0xffffff, 0.12);
      u.strokeCircle(p.x, p.y, p.weapon.range);
      u.lineStyle(3, 0xffffff, 0.8);
      u.strokeCircle(p.x, p.y, 25);
      if (p.target && p.target.alive) {
        u.lineStyle(3, 0xff4d4d, 0.9);
        u.strokeCircle(p.target.x, p.target.y, 27);
      }
    }

    // Lebensbalken
    const g = this.gfxBars;
    g.clear();
    for (const f of this.fighters) {
      if (!f.alive || f.hidden || !this.inView(f.x, f.y)) continue;
      const x = f.x - 22, y = f.y - 38;
      const hp = Phaser.Math.Clamp(f.hp / 100, 0, 1);
      g.fillStyle(0x000000, 0.55);
      g.fillRect(x - 1, y - 1, 46, 8);
      g.fillStyle(hp > 0.5 ? 0x4cd964 : hp > 0.25 ? 0xffcc00 : 0xff3b30);
      g.fillRect(x, y, 44 * hp, 6);
      if (f.armor > 0) {
        g.fillStyle(0x000000, 0.55);
        g.fillRect(x - 1, y - 6, 46, 5);
        g.fillStyle(0x4aa8ff);
        g.fillRect(x, y - 5, (44 * f.armor) / 100, 3);
      }
      if (f.healUntil) {
        const prog = 1 - (f.healUntil - now) / 2000;
        g.lineStyle(4, 0x5dff7a, 0.9);
        g.beginPath();
        g.arc(f.x, f.y, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        g.strokePath();
      } else if (f.reloading && f.isPlayer) {
        const prog = 1 - (f.reloadUntil - now) / f.weapon.reload;
        g.lineStyle(4, 0xffd23f, 0.9);
        g.beginPath();
        g.arc(f.x, f.y, 28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog);
        g.strokePath();
      }
    }
  }

  sparks(x: number, y: number, color: number, n: number) {
    if (!this.inView(x, y)) return;
    for (let i = 0; i < n; i++) {
      const s = this.add.image(x, y, 'spark').setTint(color).setDepth(14).setScale(0.6 + Math.random() * 0.6);
      const a = Math.random() * Math.PI * 2, d = 12 + Math.random() * 26;
      this.tweens.add({
        targets: s,
        x: x + Math.cos(a) * d,
        y: y + Math.sin(a) * d,
        alpha: 0,
        scale: 0.1,
        duration: 220 + Math.random() * 160,
        onComplete: () => s.destroy(),
      });
    }
  }

  floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x + (Math.random() - 0.5) * 16, y, text, {
        fontFamily: 'Arial Black, Arial, sans-serif',
        fontSize: '18px',
        color,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(70);
    this.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }
}
