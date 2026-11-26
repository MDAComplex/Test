import { WORLD, FIGHTER_COUNT, FIGHTER_R, PLAYER_SPEED, BOT_SPEED, PLANE_Z, FALL_SPEED, PLANE_TIME } from '../config';
import { WEAPONS, WeaponId, WeaponDef } from '../weapons';
import { MapData, LootKind, Obs, House } from '../mapgen';
import { botNames, BODY_COLORS, PLAYER_COLOR } from '../names';
import { recordResult } from '../storage';

// ---------- Typen ----------

export interface Rect { x: number; y: number; w: number; h: number }
export interface Obstacle {
  id: number;
  kind: Obs['kind'];
  x: number; y: number; r: number; w: number; h: number;
  rect: Rect;
  circle: boolean;
  /** blockiert Schüsse und Sicht */
  blocks: boolean;
  stamp: number;
  /** nur Kisten */
  opened: boolean;
  taken: boolean;
  progress: number;
  /** zuletzt hat der Spieler am Öffnen mitgewirkt */
  playerNear?: boolean;
}
export interface Loot { id: number; kind: LootKind; x: number; y: number; taken: boolean; from?: { x: number; y: number } }
export interface Bullet {
  id: number;
  x: number; y: number; vx: number; vy: number;
  owner: Fighter; dmg: number; traveled: number; range: number; weapon: string; wid: WeaponId;
  /** genaue Reichweite; danach streut die Kugel stärker */
  eff: number; strayed: boolean;
  dead: boolean;
}
export interface Circle { x: number; y: number; r: number }
export interface Airdrop { id: number; x: number; y: number; z: number; obstacle: Obstacle | null }
export interface Bush { x: number; y: number; r: number }
export interface GameResult { win: boolean; place: number; kills: number; time: number; teams: number }
interface Target { x: number; y: number; taken: boolean }

export type GameEvent =
  | { type: 'shot'; f: Fighter; x: number; y: number; angle: number; wid: WeaponId }
  | { type: 'punch'; f: Fighter; hit: boolean }
  | { type: 'hit'; x: number; y: number; color: number; big: boolean; byPlayer: boolean }
  | { type: 'kill'; f: Fighter; killer: string; victim: string; weapon: string; mine: boolean; me: boolean }
  | { type: 'loot'; loot: Loot }
  | { type: 'take'; loot: Loot }
  | { type: 'crate'; o: Obstacle; byPlayer: boolean }
  | { type: 'airdrop'; d: Airdrop }
  | { type: 'airdropLand'; d: Airdrop }
  | { type: 'explode'; x: number; y: number; r: number }
  | { type: 'damage'; f: Fighter; amount: number; byPlayer: boolean; toPlayer: boolean; shield: boolean; fromX: number | null; fromY: number | null }
  | { type: 'heal'; f: Fighter }
  | { type: 'weapon'; f: Fighter }
  | { type: 'toast'; text: string; color: string }
  | { type: 'pickup'; f: Fighter }
  | { type: 'jump'; f: Fighter }
  | { type: 'land'; f: Fighter }
  | { type: 'gameover'; result: GameResult }
  | { type: 'down'; f: Fighter; by: Fighter | null }
  | { type: 'revive'; f: Fighter }
  | { type: 'playerOut' };

export type Phase = 'plane' | 'fall' | 'ground';
export type Mode = 'solo' | 'duo' | 'squad';
export const TEAM_SIZE: Record<Mode, number> = { solo: 1, duo: 2, squad: 4 };
export const MODE_COUNT: Record<Mode, number> = { solo: 25, duo: 24, squad: 24 };

export class Fighter {
  id: number;
  name: string;
  isPlayer: boolean;
  color: number;
  x = 0; y = 0; z = PLANE_Z;
  phase: Phase = 'plane';
  hp = 100; armor = 0; medkits = 0; bigmeds = 0; ammo = 45;
  healAmt = 0; healTotal = 0;
  weapon: WeaponDef = WEAPONS.fists;
  mag = 0;
  lastShot = -99999;
  reloading = false; reloadUntil = 0;
  healUntil = 0;
  aim = 0; aimError = 0;
  target: Fighter | null = null; targetSince = 0; nextScan = 0;
  alive = true; kills = 0; diedAt = 0;
  inBush = false; hidden = false;
  lastFiredAt = -99999;
  lastAttacker: Fighter | null = null; lastHitAt = -99999;
  moving = false;
  /** Spielstil der Bots */
  style: 'normal' | 'aggro' | 'careful' = 'normal';
  flinchUntil = 0;
  lastTrigger = -99999;
  spinStart = 0;
  coverX = 0; coverY = 0; coverUntil = 0;
  campX = 0; campY = 0; campUntil = 0;
  /** zweiter Waffenplatz (nur Spieler) */
  backup: { w: WeaponDef; mag: number } | null = null;
  killedBy: Fighter | null = null;
  /** Team-Nummer (Solo: jeder sein eigenes Team) */
  team = 0;
  /** niedergeschlagen: kriecht, kann nicht schießen, wartet auf Wiederbelebung */
  downed = false;
  downHp = 100;
  downedBy: Fighter | null = null;
  reviveT = 0;
  leader: Fighter | null = null;
  /** Aussehen: Figur und Fallschirm */
  look: { char: 'man' | 'woman'; chute: 'round' | 'wing' } = { char: 'man', chute: 'round' };
  vx = 0;
  vy = 0;
  aiming = false;
  // Bots
  moveX = 0; moveY = 0; nextThink = 0;
  wanderX = 0; wanderY = 0; wanderUntil = 0;
  strafe = 1; lastX = 0; lastY = 0; avoidUntil = 0; avoidAngle = 0;
  lootTarget: Target | null = null; lootUntil = 0;
  jumpAt = 0; landX = 0; landY = 0;

  constructor(id: number, name: string, isPlayer: boolean, color: number) {
    this.id = id;
    this.name = name;
    this.isPlayer = isPlayer;
    this.color = color;
  }
}

export const PHASES = [
  { wait: 40000, shrink: 25000, r: 1150, dps: 2 },
  { wait: 25000, shrink: 20000, r: 720, dps: 4 },
  { wait: 20000, shrink: 18000, r: 420, dps: 6 },
  { wait: 15000, shrink: 15000, r: 200, dps: 9 },
  { wait: 10000, shrink: 12000, r: 0, dps: 14 },
];

const CELL = 160;
const GRID = Math.ceil(WORLD / CELL);
const PICKUP_R = 40;
const CRATE_REACH = 30;
const CRATE_TIME = 1800;
/** Aufhebe-Zeiten in ms */
export const PICK_TIME: Record<string, number> = { ammo: 350, weapon: 600, armor: 900, medkit: 900, bigmed: 1250, crate: CRATE_TIME };
/** Öffnungszeiten der Behälter in ms */
export const OPEN_TIME: Record<string, number> = { crate: CRATE_TIME, chest: 2200, airdrop: 3200 };
export const isContainer = (o: { kind: string }) => o.kind === 'crate' || o.kind === 'chest' || o.kind === 'airdrop';
// drei Versorgungspakete pro Match
const AIRDROP_TIMES = [70000, 130000, 185000];
const AIRDROP_Z = 900;
export const pickTime = (k: LootKind) => (k.startsWith('w:') ? PICK_TIME.weapon : PICK_TIME[k]);

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const wrap = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const rotateTo = (cur: number, target: number, k: number) => cur + wrap(target - cur) * k;
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

/** Liang-Barsky: Eintritts-Parameter t (0..1) der Strecke in das Rechteck oder null. */
export function segRect(x1: number, y1: number, x2: number, y2: number, r: Rect): number | null {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return t0;
}

export const lootLabel = (k: LootKind) =>
  k === 'ammo' ? 'Munition' : k === 'armor' ? 'Rüstung' : k === 'medkit' ? 'Kleines Medikit' : k === 'bigmed' ? 'Großes Medikit' : WEAPONS[k.slice(2) as WeaponId].name;

// ---------- Spiel ----------

export class Game {
  map: MapData;
  houses: House[];
  time = 0;
  fighters: Fighter[] = [];
  player: Fighter;
  obstacles: Obstacle[] = [];
  grid: Obstacle[][];
  queryStamp = 0;
  loot: Loot[] = [];
  bullets: Bullet[] = [];
  bushes: Bush[] = [];
  zoneCur: Circle;
  zoneNext: Circle;
  zoneFrom: Circle;
  phase = 0;
  phaseStart = PLANE_TIME;
  zoneState: 'wait' | 'shrink' | 'done' = 'wait';
  plane: { x1: number; y1: number; x2: number; y2: number };
  events: GameEvent[] = [];
  airdrops: Airdrop[] = [];
  private nextAirdrop = 0;
  over = false;
  result: GameResult | null = null;
  input = { mx: 0, my: 0, aim: null as number | null, firing: false, autoWeapon: false, jump: false, heal: false, reload: false, pickup: false, swap: false };
  /** Zähler für Aufgaben und Erfahrungspunkte */
  stats = { chests: 0, airdrops: 0, shields: 0, heals: 0 };
  /** Kamera folgt nach dem Tod diesem Kämpfer */
  spectate: Fighter | null = null;
  nearbyWeapon: Loot | null = null;
  /** Was der Spieler gerade aufhebt (Ring-Fortschritt) */
  pick: { loot: Loot; t: number; total: number } | null = null;
  nextPickup = 0;
  nextZoneTick = 0;
  private ids = 1;

  mode: Mode;
  constructor(map: MapData, playerColor = PLAYER_COLOR, mode: Mode = 'solo', look?: Fighter['look']) {
    this.mode = mode;
    this.map = map;
    this.houses = map.houses;
    this.grid = Array.from({ length: GRID * GRID }, () => []);
    for (const o of map.obstacles) this.addObstacle(o);
    for (const l of map.loot) this.spawnLoot(l.x, l.y, l.kind, false);

    // Flugroute quer über die Karte
    const a = 400 + Math.random() * (WORLD - 800), b = 400 + Math.random() * (WORLD - 800);
    const m = 300;
    this.plane = Math.random() < 0.5
      ? { x1: -m, y1: a, x2: WORLD + m, y2: b }
      : { x1: a, y1: -m, x2: b, y2: WORLD + m };

    this.player = this.addFighter('Du', true, playerColor);
    if (look) this.player.look = { ...look };
    const size = TEAM_SIZE[mode], count = mode === 'solo' ? FIGHTER_COUNT : MODE_COUNT[mode];
    const names = botNames(count - 1);
    for (let i = 0; i < count - 1; i++) {
      const f = this.addFighter(names[i], false, BODY_COLORS[i % BODY_COLORS.length]);
      f.team = Math.floor((i + 1) / size);
      f.look = { char: Math.random() < 0.5 ? 'man' : 'woman', chute: Math.random() < 0.5 ? 'round' : 'wing' };
      f.strafe = Math.random() < 0.5 ? 1 : -1;
      const st = Math.random();
      f.style = st < 0.3 ? 'aggro' : st < 0.6 ? 'careful' : 'normal';
      // erster Bot eines Teams plant den Absprung, die anderen folgen ihm
      const lead = this.fighters.find((x) => x.team === f.team && x !== f) ?? null;
      f.leader = lead;
      if (f.team === 0) {
        f.jumpAt = Infinity; // springt mit dem Spieler
      } else if (lead) {
        f.jumpAt = lead.jumpAt + 150 + Math.random() * 300;
        f.landX = lead.landX + (Math.random() - 0.5) * 220;
        f.landY = lead.landY + (Math.random() - 0.5) * 220;
      } else {
        this.planBotDrop(f);
      }
    }
    const pp = this.planePos();
    for (const f of this.fighters) { f.x = pp.x; f.y = pp.y; }

    this.zoneCur = { x: WORLD / 2, y: WORLD / 2, r: WORLD * 0.72 };
    this.zoneFrom = { ...this.zoneCur };
    this.zoneNext = this.computeNext(this.zoneCur, PHASES[0].r);
  }

  private addFighter(name: string, isPlayer: boolean, color: number) {
    const f = new Fighter(this.ids++, name, isPlayer, color);
    f.aim = Math.random() * Math.PI * 2;
    this.fighters.push(f);
    return f;
  }

  private addObstacle(o: Obs): Obstacle | null {
    if (o.kind === 'bush') {
      this.bushes.push({ x: o.x, y: o.y, r: o.r });
      return null;
    }
    const circle = o.kind === 'rock' || o.kind === 'tree' || o.kind === 'barrel' || o.kind === 'water';
    let rect: Rect;
    if (circle) {
      const s = o.r * 0.82;
      rect = { x: o.x - s, y: o.y - s, w: s * 2, h: s * 2 };
    } else {
      rect = { x: o.x - o.w / 2, y: o.y - o.h / 2, w: o.w, h: o.h };
    }
    const blocks = o.kind !== 'water' && o.kind !== 'fence';
    const ob: Obstacle = { id: this.ids++, kind: o.kind, x: o.x, y: o.y, r: o.r, w: o.w, h: o.h, rect, circle, blocks, stamp: 0, opened: false, taken: false, progress: 0 };
    this.obstacles.push(ob);
    const c0 = clamp(Math.floor(rect.x / CELL), 0, GRID - 1), c1 = clamp(Math.floor((rect.x + rect.w) / CELL), 0, GRID - 1);
    const r0 = clamp(Math.floor(rect.y / CELL), 0, GRID - 1), r1 = clamp(Math.floor((rect.y + rect.h) / CELL), 0, GRID - 1);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) this.grid[cy * GRID + cx].push(ob);
    return ob;
  }

  query(x0: number, y0: number, x1: number, y1: number, cb: (o: Obstacle) => boolean | void): boolean {
    const stamp = ++this.queryStamp;
    const c0 = clamp(Math.floor(x0 / CELL), 0, GRID - 1), c1 = clamp(Math.floor(x1 / CELL), 0, GRID - 1);
    const r0 = clamp(Math.floor(y0 / CELL), 0, GRID - 1), r1 = clamp(Math.floor(y1 / CELL), 0, GRID - 1);
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        for (const o of this.grid[cy * GRID + cx]) {
          if (o.stamp === stamp) continue;
          o.stamp = stamp;
          if (cb(o) === true) return true;
        }
      }
    }
    return false;
  }

  hasLOS(x1: number, y1: number, x2: number, y2: number) {
    return !this.query(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2), (o) => o.blocks && segRect(x1, y1, x2, y2, o.rect) !== null);
  }

  /** Entfernung, bis ein Strahl auf ein Hindernis trifft (für Effekte) */
  rayLength(x: number, y: number, angle: number, range: number) {
    const x2 = x + Math.cos(angle) * range, y2 = y + Math.sin(angle) * range;
    let best = 1;
    this.query(Math.min(x, x2), Math.min(y, y2), Math.max(x, x2), Math.max(y, y2), (o) => {
      if (!o.blocks) return;
      const t = segRect(x, y, x2, y2, o.rect);
      if (t !== null && t < best) best = t;
    });
    return best * range;
  }

  isFree(x: number, y: number, pad = 28) {
    if (x < 80 || y < 80 || x > WORLD - 80 || y > WORLD - 80) return false;
    return !this.query(x - pad, y - pad, x + pad, y + pad, (o) =>
      x > o.rect.x - pad && x < o.rect.x + o.rect.w + pad && y > o.rect.y - pad && y < o.rect.y + o.rect.h + pad,
    );
  }

  findFreeNear(x: number, y: number) {
    x = clamp(x, 100, WORLD - 100);
    y = clamp(y, 100, WORLD - 100);
    for (let r = 0; r < 600; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (this.isFree(px, py)) return { x: px, y: py };
        if (r === 0) break;
      }
    }
    return { x, y };
  }

  planePos(t = this.time / PLANE_TIME) {
    const p = this.plane, k = clamp(t, 0, 1);
    return { x: p.x1 + (p.x2 - p.x1) * k, y: p.y1 + (p.y2 - p.y1) * k, angle: Math.atan2(p.y2 - p.y1, p.x2 - p.x1) };
  }

  private planBotDrop(f: Fighter) {
    const t = 0.08 + Math.random() * 0.84;
    const pp = this.planePos(t);
    const perp = pp.angle + Math.PI / 2;
    const off = (Math.random() - 0.5) * 1800;
    const spot = this.findFreeNear(pp.x + Math.cos(perp) * off + (Math.random() - 0.5) * 300, pp.y + Math.sin(perp) * off + (Math.random() - 0.5) * 300);
    f.landX = spot.x;
    f.landY = spot.y;
    f.jumpAt = t * PLANE_TIME;
  }

  spawnLoot(x: number, y: number, kind: LootKind, announce = true, from?: { x: number; y: number }) {
    const l: Loot = { id: this.ids++, kind, x: clamp(x, 40, WORLD - 40), y: clamp(y, 40, WORLD - 40), taken: false, from };
    this.loot.push(l);
    if (announce) this.events.push({ type: 'loot', loot: l });
    return l;
  }

  computeNext(cur: Circle, r: number): Circle {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * Math.max(0, cur.r - r) * 0.85;
    const lim = Math.max(150, r * 0.6);
    return { x: clamp(cur.x + Math.cos(a) * d, lim, WORLD - lim), y: clamp(cur.y + Math.sin(a) * d, lim, WORLD - lim), r };
  }

  aliveCount() {
    let n = 0;
    for (const f of this.fighters) if (f.alive) n++;
    return n;
  }

  ally(a: Fighter, b: Fighter) { return a.team === b.team; }

  /** Teams, in denen noch jemand lebt */
  aliveTeams() {
    const t = new Set<number>();
    for (const f of this.fighters) if (f.alive) t.add(f.team);
    return t;
  }

  teamCount() {
    return new Set(this.fighters.map((f) => f.team)).size;
  }

  teammates(f: Fighter) { return this.fighters.filter((x) => x !== f && x.team === f.team); }

  /** steht im Team noch jemand (nicht niedergeschlagen)? */
  private teamStanding(f: Fighter) {
    return this.fighters.some((x) => x !== f && x.team === f.team && x.alive && !x.downed);
  }

  // ---------- Hauptschleife ----------

  update(dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    this.time += Math.min(dtMs, 50);
    const now = this.time;

    this.updateZone(now);
    this.updateDrop(now, dt);

    if (this.player.alive) this.handlePlayer(now, dt);
    this.input.jump = this.input.heal = this.input.reload = this.input.pickup = this.input.swap = false;
    if (this.spectate && !this.spectate.alive) this.spectate = this.nextSpectate(this.spectate);

    for (const f of this.fighters) {
      if (!f.alive || f.phase === 'plane') continue;
      if (!f.isPlayer) {
        if (now >= f.nextThink) this.think(f, now);
        f.aiming = !!f.target;
        this.drive(f, f.moveX, f.moveY, this.speedOf(f), dt);
      }
      if (f.phase === 'ground' && !f.downed) this.updateCombat(f, now);
    }
    this.updateBullets(dt);
    this.updateContainers(dt);
    if (now >= this.nextPickup) {
      this.nextPickup = now + 100;
      this.updatePickups();
    }
    if (now >= this.nextZoneTick) {
      this.nextZoneTick = now + 500;
      this.zoneDamage();
    }
    this.updateCover(now);
    this.updateAirdrops(now, dt);
    if (this.mode !== 'solo') this.updateDowned(dt);
  }

  private updateDrop(now: number, dt: number) {
    const pp = this.planePos();
    const end = now >= PLANE_TIME;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (f.phase === 'plane') {
        const go = f.isPlayer ? this.input.jump || end
          : f.team === this.player.team && this.mode !== 'solo' ? this.player.phase !== 'plane' || end
          : now >= f.jumpAt || end;
        f.x = pp.x;
        f.y = pp.y;
        if (go) {
          f.phase = 'fall';
          f.z = PLANE_Z - 40;
          f.x = clamp(f.x, 60, WORLD - 60);
          f.y = clamp(f.y, 60, WORLD - 60);
          this.events.push({ type: 'jump', f });
        }
      } else if (f.phase === 'fall') {
        f.z -= FALL_SPEED * dt * (f.z > 300 ? 1.6 : 1);
        // tief über einem Haus: vom Dach seitlich abrutschen, damit niemand ins Haus fällt
        if (f.z < 220) this.pushOutOfHouse(f);
        if (f.z <= 0) {
          f.z = 0;
          f.phase = 'ground';
          this.pushOutOfHouse(f);
          const p = this.findFreeNear(f.x, f.y);
          f.x = p.x;
          f.y = p.y;
          f.lastX = f.x;
          f.lastY = f.y;
          this.events.push({ type: 'land', f });
        }
      }
    }
  }

  /** schiebt einen Fallschirmspringer zur nächsten Außenkante, wenn er über einem Haus ist */
  private pushOutOfHouse(f: Fighter) {
    const m = 40;
    for (const h of this.houses) {
      const hs = h.s / 2 + m;
      const dx = f.x - h.x, dy = f.y - h.y;
      if (Math.abs(dx) >= hs || Math.abs(dy) >= hs) continue;
      if (hs - Math.abs(dx) < hs - Math.abs(dy)) f.x = h.x + Math.sign(dx || 1) * hs;
      else f.y = h.y + Math.sign(dy || 1) * hs;
    }
  }

  private move(f: Fighter, vx: number, vy: number, dt: number) {
    f.x += vx * dt;
    f.y += vy * dt;
    if (f.phase === 'ground') {
      for (let i = 0; i < 2; i++) this.resolve(f);
    }
    f.x = clamp(f.x, FIGHTER_R + 2, WORLD - FIGHTER_R - 2);
    f.y = clamp(f.y, FIGHTER_R + 2, WORLD - FIGHTER_R - 2);
  }

  private resolve(f: Fighter) {
    const R = FIGHTER_R;
    this.query(f.x - R - 60, f.y - R - 60, f.x + R + 60, f.y + R + 60, (o) => {
      if (o.circle) {
        const dx = f.x - o.x, dy = f.y - o.y, d = Math.hypot(dx, dy), m = R + o.r;
        if (d < m && d > 0.001) {
          f.x = o.x + (dx / d) * m;
          f.y = o.y + (dy / d) * m;
        }
      } else {
        const r = o.rect;
        const cx = clamp(f.x, r.x, r.x + r.w), cy = clamp(f.y, r.y, r.y + r.h);
        const dx = f.x - cx, dy = f.y - cy, d = Math.hypot(dx, dy);
        if (d < R) {
          if (d > 0.001) {
            f.x = cx + (dx / d) * R;
            f.y = cy + (dy / d) * R;
          } else {
            // Mittelpunkt im Rechteck: zur nächsten Kante schieben
            const l = f.x - r.x, rr = r.x + r.w - f.x, t = f.y - r.y, b = r.y + r.h - f.y;
            const m = Math.min(l, rr, t, b);
            if (m === l) f.x = r.x - R;
            else if (m === rr) f.x = r.x + r.w + R;
            else if (m === t) f.y = r.y - R;
            else f.y = r.y + r.h + R;
          }
        }
      }
    });
  }

  private handlePlayer(now: number, dt: number) {
    const f = this.player;
    let mx = this.input.mx, my = this.input.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    if (f.phase === 'plane') return;
    // langsamer nur, solange geschossen wird (Zielen ohne Schießen gibt es nicht)
    f.aiming = f.phase === 'ground' && (this.input.firing || now - f.lastShot < 250);
    this.drive(f, mx, my, this.speedOf(f), dt);
    f.moveX = mx;
    f.moveY = my;
    if (f.downed && (mx || my)) f.aim = rotateTo(f.aim, Math.atan2(my, mx), 0.15);
    if (f.phase !== 'ground' || f.downed) return;
    if (this.input.reload) this.startReload(f, now);
    if (this.input.pickup && this.nearbyWeapon && !this.nearbyWeapon.taken && (!this.pick || this.pick.loot !== this.nearbyWeapon)) {
      this.pick = { loot: this.nearbyWeapon, t: 0, total: PICK_TIME.weapon };
    }
    if (this.input.swap) this.swapWeapon(f);
    this.updatePlayerPick(f, dt);
  }

  swapWeapon(f: Fighter) {
    if (!f.backup) return;
    const cur = { w: f.weapon, mag: f.mag };
    f.weapon = f.backup.w;
    f.mag = f.backup.mag;
    f.backup = cur;
    f.reloading = false;
    this.events.push({ type: 'weapon', f });
  }

  /** nach dem Tod: Mörder zuschauen, sonst irgendeinem Überlebenden */
  nextSpectate(dead: Fighter | null): Fighter | null {
    if (dead?.killedBy && dead.killedBy.alive) return dead.killedBy;
    return this.fighters.find((x) => x.alive && x.phase === 'ground') ?? null;
  }

  // ---------- Bewegung ----------

  /** Laufgeschwindigkeit: Waffe, Zielen und Heilen machen langsamer */
  speedOf(f: Fighter) {
    if (f.phase === 'fall') return f.isPlayer ? 230 : 210;
    if (f.downed) return 48;
    const base = f.isPlayer ? PLAYER_SPEED : BOT_SPEED;
    return base * f.weapon.moveMul * (f.aiming ? 0.7 : 1) * (f.healUntil ? 0.5 : 1);
  }

  /** Weiches Beschleunigen/Abbremsen statt sofortiger Richtungswechsel */
  private drive(f: Fighter, dx: number, dy: number, speed: number, dt: number) {
    const active = dx !== 0 || dy !== 0;
    // scharfer Richtungswechsel kostet bis zu 10 % Tempo
    const cur = Math.hypot(f.vx, f.vy), want = Math.hypot(dx, dy);
    if (active && cur > 30 && want > 0) {
      const dot = (f.vx * dx + f.vy * dy) / (cur * want);
      speed *= 1 - 0.1 * (1 - dot) / 2;
    }
    const tx = dx * speed, ty = dy * speed;
    const rate = f.phase === 'fall' ? 2.5 : active ? 8 : 11;
    const k = 1 - Math.exp(-dt * rate);
    f.vx += (tx - f.vx) * k;
    f.vy += (ty - f.vy) * k;
    if (!active && Math.hypot(f.vx, f.vy) < 4) { f.vx = 0; f.vy = 0; }
    const ox = f.x, oy = f.y;
    this.move(f, f.vx, f.vy, dt);
    // an Wänden nicht weiter "anschieben"
    if (dt > 0 && f.phase === 'ground') {
      f.vx = lerpN(f.vx, (f.x - ox) / dt, 0.5);
      f.vy = lerpN(f.vy, (f.y - oy) / dt, 0.5);
    }
    f.moving = f.phase === 'ground' && Math.hypot(f.vx, f.vy) > 25;
  }

  /** Spieler zielt selbst; optionale Zielhilfe für Touch */
  private playerAim(f: Fighter, now: number) {
    const a = this.input.aim;
    if (a !== null) {
      const ang = a;
      f.aim = rotateTo(f.aim, ang, 0.5);
    } else if (f.moveX || f.moveY) {
      f.aim = rotateTo(f.aim, Math.atan2(f.moveY, f.moveX), 0.18);
    }
    if (this.input.firing && !f.healUntil) this.tryFire(f, now);
    else if (f.mag < f.weapon.mag && f.ammo > 0 && now - f.lastShot > 1500) this.startReload(f, now);
  }

  // ---------- Kampf ----------

  private updateCombat(f: Fighter, now: number) {
    if (f.reloading && now >= f.reloadUntil) {
      const take = Math.min(f.weapon.mag - f.mag, f.ammo);
      f.mag += take;
      f.ammo -= take;
      f.reloading = false;
    }
    if (f.healUntil && now >= f.healUntil) {
      f.healUntil = 0;
      f.hp = Math.min(100, f.hp + f.healAmt);
      this.events.push({ type: 'heal', f });
    }
    if (f.isPlayer) {
      this.playerAim(f, now);
      return;
    }
    if (now >= f.nextScan) {
      f.nextScan = now + 140 + Math.random() * 80;
      const t = this.findTarget(f, now);
      if (t !== f.target) {
        f.target = t;
        f.targetSince = now;
      }
    }
    if (f.target && (!f.target.alive || f.target.phase !== 'ground')) f.target = null;

    if (f.target) {
      const ang = Math.atan2(f.target.y - f.y, f.target.x - f.x);
      f.aim = rotateTo(f.aim, ang + (f.isPlayer ? 0 : f.aimError), 0.35);
    } else if (f.moveX || f.moveY) {
      f.aim = rotateTo(f.aim, Math.atan2(f.moveY, f.moveX), 0.2);
    }

    const canFire = f.target && !f.healUntil && now - f.targetSince > 650;
    if (canFire) this.tryFire(f, now);
    else if (!f.target && f.mag < f.weapon.mag && f.ammo > 0 && now - f.lastShot > 1500) this.startReload(f, now);
  }

  private findTarget(f: Fighter, now: number): Fighter | null {
    let best: Fighter | null = null;
    // Bots greifen anfangs zurückhaltender an, später voll
    const ramp = clamp(0.55 + ((now - PLANE_TIME) / 90000) * 0.45, 0.55, 1);
    const styleK = f.style === 'aggro' ? 1.05 : f.style === 'careful' ? 0.8 : 0.92;
    let bestD = f.weapon.id === 'fists' ? 220 : f.weapon.range * (f.isPlayer ? 1 : ramp * styleK);
    for (const o of this.fighters) {
      if (o === f || !o.alive || o.phase !== 'ground' || this.ally(o, f)) continue;
      // Niedergeschlagene werden erledigt, wenn kein stehender Gegner näher ist
      const d = Math.hypot(o.x - f.x, o.y - f.y) * (o.downed ? 1.25 : 1);
      if (d >= bestD) continue;
      if (o.inBush && d > 140 && now - o.lastFiredAt > 900) continue;
      if (!this.hasLOS(f.x, f.y, o.x, o.y)) continue;
      best = o;
      bestD = d;
    }
    return best;
  }

  private tryFire(f: Fighter, now: number) {
    const w = f.weapon;
    if (w.id === 'fists') {
      if (now - f.lastShot < w.rate) return;
      f.lastShot = now;
      f.lastFiredAt = now;
      // Gegner direkt vor einem treffen
      let hit: Fighter | null = null, bd = w.range + FIGHTER_R;
      for (const o of this.fighters) {
        if (o === f || !o.alive || o.phase !== 'ground' || this.ally(o, f)) continue;
        const d = Math.hypot(o.x - f.x, o.y - f.y);
        const diff = Math.abs(wrap(Math.atan2(o.y - f.y, o.x - f.x) - f.aim));
        if (d < bd && diff < 1.0) { bd = d; hit = o; }
      }
      this.events.push({ type: 'punch', f, hit: !!hit });
      if (hit) {
        this.events.push({ type: 'hit', x: hit.x, y: hit.y, color: hit.color, big: true, byPlayer: f === this.player });
        this.damage(hit, f.isPlayer ? w.damage : w.damage * 0.85, f, false, w.name);
      }
      return;
    }
    if (w.id === 'minigun') {
      // Läufe müssen erst hochdrehen
      if (now - f.lastTrigger > 250) f.spinStart = now;
      f.lastTrigger = now;
      if (now - f.spinStart < 450) return;
    } else {
      f.lastTrigger = now;
    }
    if (f.reloading || now - f.lastShot < w.rate) return;
    if (f.mag <= 0) {
      this.startReload(f, now);
      return;
    }
    f.mag--;
    f.lastShot = now;
    f.lastFiredAt = now;
    const extra = f.isPlayer ? 0 : 0.12;
    const sx = f.x + Math.cos(f.aim) * 20, sy = f.y + Math.sin(f.aim) * 20;
    for (let i = 0; i < w.pellets; i++) {
      const a = f.aim + (Math.random() - 0.5) * 2 * (w.spread + extra);
      this.bullets.push({
        id: this.ids++, x: sx, y: sy, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        owner: f, dmg: f.isPlayer ? w.damage : w.damage * 0.85, traveled: 0, range: w.range * (w.splash ? 1 : 1.6), weapon: w.name, wid: w.id, dead: false, eff: w.range, strayed: false,
      });
    }
    if (!f.isPlayer) {
      // Bots: ungenauer auf Distanz, direkt nach dem Erfassen und nach eigenen Treffern
      const d = f.target ? Math.hypot(f.target.x - f.x, f.target.y - f.y) : w.range;
      const warm = Math.max(0, 1 - (now - f.targetSince) / 1400) * 0.3;
      const flinch = now < f.flinchUntil ? 0.35 : 0;
      f.aimError = (Math.random() - 0.5) * 2 * (0.12 + (d / w.range) * 0.3 + warm + flinch);
    }
    this.events.push({ type: 'shot', f, x: f.x + Math.cos(f.aim) * (w.length + 14), y: f.y + Math.sin(f.aim) * (w.length + 14), angle: f.aim, wid: w.id });
    if (f.mag === 0) this.startReload(f, now);
  }

  startReload(f: Fighter, now: number) {
    if (f.weapon.id === 'fists') return;
    if (f.reloading || f.ammo <= 0 || f.mag >= f.weapon.mag) return;
    f.reloading = true;
    f.reloadUntil = now + f.weapon.reload;
  }

  startHeal(f: Fighter, now: number) {
    if (f.healUntil || f.hp >= 100 || (f.medkits <= 0 && f.bigmeds <= 0)) return;
    // großes Medikit bei viel Schaden, sonst kleines
    const big = f.bigmeds > 0 && (f.hp <= 45 || f.medkits <= 0);
    if (big) { f.bigmeds--; f.healAmt = 70; f.healTotal = 3000; }
    else { f.medkits--; f.healAmt = 30; f.healTotal = 1600; }
    f.healUntil = now + f.healTotal;
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      const dx = b.vx * dt, dy = b.vy * dt;
      const nx = b.x + dx, ny = b.y + dy;
      const seg2 = dx * dx + dy * dy || 1;
      let hitT = 1;
      let hitF: Fighter | null = null;
      let hitO = false;
      for (const f of this.fighters) {
        if (!f.alive || f === b.owner || f.phase !== 'ground' || this.ally(f, b.owner)) continue;
        const t = clamp(((f.x - b.x) * dx + (f.y - b.y) * dy) / seg2, 0, 1);
        const cx = b.x + dx * t - f.x, cy = b.y + dy * t - f.y;
        if (cx * cx + cy * cy <= (FIGHTER_R + 4) ** 2 && t < hitT) {
          hitT = t;
          hitF = f;
        }
      }
      this.query(Math.min(b.x, nx), Math.min(b.y, ny), Math.max(b.x, nx), Math.max(b.y, ny), (o) => {
        if (!o.blocks) return;
        const t = segRect(b.x, b.y, nx, ny, o.rect);
        if (t !== null && t < hitT) {
          hitT = t;
          hitO = true;
          hitF = null;
        }
      });
      const hx = b.x + dx * hitT, hy = b.y + dy * hitT;
      const splash = WEAPONS[b.wid].splash;
      if (splash && (hitF || hitO || b.traveled + Math.sqrt(seg2) >= b.range)) {
        this.explode(hitF || hitO ? hx : nx, hitF || hitO ? hy : ny, splash, b);
        b.dead = true;
        continue;
      }
      if (hitF) {
        const f = hitF as Fighter;
        this.events.push({ type: 'hit', x: hx, y: hy, color: f.color, big: true, byPlayer: b.owner === this.player });
        this.damage(f, b.dmg, b.owner, false, b.weapon);
        b.dead = true;
      } else if (hitO) {
        this.events.push({ type: 'hit', x: hx, y: hy, color: 0xd8d0c0, big: false, byPlayer: b.owner === this.player });
        b.dead = true;
      } else {
        b.x = nx;
        b.y = ny;
        b.traveled += Math.sqrt(seg2);
        if (b.traveled >= b.range) b.dead = true;
        else if (!b.strayed && b.traveled > b.eff) {
          // jenseits der genauen Reichweite: Kugel weicht ab und verliert Wucht
          b.strayed = true;
          const w = WEAPONS[b.wid];
          const a = Math.atan2(b.vy, b.vx) + (Math.random() - 0.5) * 2 * (w.spread * 2 + 0.12);
          const sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(a) * sp;
          b.vy = Math.sin(a) * sp;
          b.dmg *= 0.6;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
  }

  private explode(x: number, y: number, r: number, b: Bullet) {
    this.events.push({ type: 'explode', x, y, r });
    for (const f of this.fighters) {
      if (!f.alive || f.phase !== 'ground' || (f !== b.owner && this.ally(f, b.owner))) continue;
      const d = Math.hypot(f.x - x, f.y - y);
      if (d > r + FIGHTER_R) continue;
      if (!this.hasLOS(x, y, f.x, f.y) && d > 30) continue;
      const k = Math.max(0.25, 1 - d / (r + FIGHTER_R));
      this.damage(f, b.dmg * k * (f === b.owner ? 0.5 : 1), b.owner, false, b.weapon);
    }
  }

  // ---------- Versorgungspakete ----------

  private updateAirdrops(now: number, dt: number) {
    if (this.nextAirdrop < AIRDROP_TIMES.length && now >= AIRDROP_TIMES[this.nextAirdrop]) {
      this.nextAirdrop++;
      const c = this.zoneNext.r > 0 ? this.zoneNext : this.zoneCur;
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * c.r * 0.7;
      const p = this.findFreeNear(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d);
      const drop: Airdrop = { id: this.ids++, x: p.x, y: p.y, z: AIRDROP_Z, obstacle: null };
      this.airdrops.push(drop);
      this.events.push({ type: 'airdrop', d: drop });
      this.events.push({ type: 'toast', text: 'Versorgungspaket im Anflug!', color: '#ffa726' });
    }
    for (const d of this.airdrops) {
      if (d.obstacle) continue;
      d.z -= 75 * dt;
      if (d.z <= 0) {
        d.z = 0;
        d.obstacle = this.addObstacle({ kind: 'airdrop', x: d.x, y: d.y, r: 28, w: 56, h: 56 });
        // niemand soll im Paket stecken
        for (const f of this.fighters) if (f.alive && f.phase === 'ground') this.resolve(f);
        this.events.push({ type: 'airdropLand', d });
      }
    }
  }

  damage(f: Fighter, amount: number, attacker: Fighter | null, ignoreArmor: boolean, weapon: string) {
    if (!f.alive) return;
    if (f.downed) {
      f.downHp -= amount;
      this.events.push({ type: 'damage', f, amount: Math.round(amount), byPlayer: attacker === this.player, toPlayer: f === this.player, shield: false, fromX: attacker ? attacker.x : null, fromY: attacker ? attacker.y : null });
      if (f.downHp <= 0) this.kill(f, attacker ?? f.downedBy, weapon);
      return;
    }
    let dmg = amount;
    const shield = !ignoreArmor && f.armor > 0;
    if (shield) {
      const a = Math.min(f.armor, dmg * 0.6);
      f.armor -= a;
      dmg -= a;
    }
    f.hp -= dmg;
    if (attacker) {
      f.lastAttacker = attacker;
      f.lastHitAt = this.time;
      if (!f.isPlayer) f.flinchUntil = this.time + 600;
    }
    this.events.push({
      type: 'damage', f, amount: Math.round(f === this.player ? dmg : amount), byPlayer: attacker === this.player, toPlayer: f === this.player, shield,
      fromX: attacker ? attacker.x : null, fromY: attacker ? attacker.y : null,
    });
    if (f.hp <= 0) {
      if (this.mode !== 'solo' && this.teamStanding(f)) this.knockDown(f, attacker);
      else this.kill(f, attacker, weapon);
    }
  }

  private kill(f: Fighter, attacker: Fighter | null, weapon: string) {
    f.alive = false;
    f.hp = 0;
    f.target = null;
    f.diedAt = this.time;
    f.killedBy = attacker;
    if (attacker) attacker.kills++;
    const drops: LootKind[] = [];
    if (f.weapon.id !== 'fists') drops.push(`w:${f.weapon.id}` as LootKind);
    if (f.ammo >= 15) drops.push('ammo');
    if (f.armor >= 25) drops.push('armor');
    if (f.backup && f.backup.w.id !== 'pistol') drops.push(`w:${f.backup.w.id}` as LootKind);
    const off = Math.random() * Math.PI;
    drops.forEach((k, i) => {
      const a = off + (i / drops.length) * Math.PI * 2;
      this.spawnLoot(f.x + Math.cos(a) * 32, f.y + Math.sin(a) * 32, k);
    });
    f.downed = false;
    const alive = this.aliveCount();
    this.events.push({
      type: 'kill', f,
      killer: attacker ? attacker.name : 'Zone',
      victim: f.name,
      weapon: attacker ? weapon : 'Zone',
      mine: attacker === this.player,
      me: f === this.player,
    });
    this.checkTeams();
    if (this.over) return;
    if (f === this.player && this.aliveTeams().has(this.player.team)) {
      // Spieler ist raus, das Team kämpft weiter: automatisch zuschauen
      this.spectate = this.teammates(f).find((x) => x.alive) ?? null;
      this.events.push({ type: 'playerOut' });
    }
    void alive;
  }

  /** Team ausgelöscht, wenn niemand mehr steht; Sieg, wenn nur noch ein Team lebt */
  private checkTeams() {
    if (this.mode !== 'solo') {
      for (const team of this.aliveTeams()) {
        const members = this.fighters.filter((x) => x.team === team && x.alive);
        if (members.length && members.every((x) => x.downed)) {
          for (const m of members) this.kill(m, m.downedBy, 'Niedergeschlagen');
          return;
        }
      }
    }
    if (this.over) return;
    const teams = this.aliveTeams();
    const mine = this.player.team;
    if (!teams.has(mine)) this.endGame(false, teams.size + 1);
    else if (teams.size === 1) this.endGame(true, 1);
  }

  private knockDown(f: Fighter, by: Fighter | null) {
    f.downed = true;
    f.hp = 0;
    f.downHp = 100;
    f.downedBy = by;
    f.reviveT = 0;
    f.target = null;
    f.reloading = false;
    f.healUntil = 0;
    this.events.push({ type: 'down', f, by });
    this.checkTeams();
  }

  /** Niedergeschlagene bluten aus; Teamkameraden in der Nähe beleben wieder */
  private updateDowned(dt: number) {
    for (const f of this.fighters) {
      if (!f.alive || !f.downed) continue;
      // nach ca. 30 Sekunden ausgeblutet
      f.downHp -= dt * 100 / 30;
      if (f.downHp <= 0) { this.kill(f, f.downedBy, 'Verblutet'); continue; }
      const helper = this.fighters.find((x) => x !== f && x.alive && !x.downed && x.phase === 'ground' && this.ally(x, f) && Math.hypot(x.x - f.x, x.y - f.y) < 55);
      if (helper) {
        f.reviveT += dt;
        if (f.reviveT >= 3.5) {
          f.downed = false;
          f.hp = 30;
          f.reviveT = 0;
          this.events.push({ type: 'revive', f });
        }
      } else {
        f.reviveT = Math.max(0, f.reviveT - dt * 2);
      }
    }
  }

  private endGame(win: boolean, place: number) {
    if (this.over) return;
    this.over = true;
    this.result = { win, place, kills: this.player.kills, time: this.time, teams: this.teamCount() };
    recordResult(place, this.player.kills, win);
    this.events.push({ type: 'gameover', result: this.result });
  }

  // ---------- Bots ----------

  safeCircle(now: number): Circle {
    if (this.zoneState === 'shrink') return this.zoneNext;
    if (this.zoneState === 'wait' && PHASES[this.phase].wait - (now - this.phaseStart) < 12000) return this.zoneNext;
    return this.zoneCur;
  }

  private think(f: Fighter, now: number) {
    f.nextThink = now + 220 + Math.random() * 120;
    if (f.phase === 'fall') {
      const lead = this.mode !== 'solo' ? (f.team === this.player.team ? this.player : f.leader) : null;
      if (lead && lead.alive) { f.landX = lead.x + ((f.id % 3) - 1) * 90; f.landY = lead.y + ((f.id % 2) ? 70 : -70); }
      const dx = f.landX - f.x, dy = f.landY - f.y, d = Math.hypot(dx, dy);
      f.moveX = d > 20 ? dx / d : 0;
      f.moveY = d > 20 ? dy / d : 0;
      return;
    }
    const safe = this.safeCircle(now);
    const dSafe = Math.hypot(safe.x - f.x, safe.y - f.y) || 1;
    const outside = dSafe > Math.max(40, safe.r * 0.8);
    const t = f.target;
    let dx = 0, dy = 0;
    if (this.mode !== 'solo') {
      const mates = this.teammates(f).filter((x) => x.alive && x.phase === 'ground');
      if (f.downed) {
        // zum nächsten stehenden Teamkameraden kriechen
        const m = mates.filter((x) => !x.downed).sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
        f.moveX = m ? Math.sign(m.x - f.x) * Math.min(1, Math.abs(m.x - f.x) / 60) : 0;
        f.moveY = m ? Math.sign(m.y - f.y) * Math.min(1, Math.abs(m.y - f.y) / 60) : 0;
        if (f.moveX || f.moveY) f.aim = rotateTo(f.aim, Math.atan2(f.moveY, f.moveX), 0.3);
        return;
      }
      // niedergeschlagenen Teamkameraden wiederbeleben, wenn kein Gegner in Sicht
      const hurt = mates.find((x) => x.downed && Math.hypot(x.x - f.x, x.y - f.y) < 900);
      if (hurt && !t) {
        const d = Math.hypot(hurt.x - f.x, hurt.y - f.y);
        f.moveX = d > 30 ? (hurt.x - f.x) / d : 0;
        f.moveY = d > 30 ? (hurt.y - f.y) / d : 0;
        return;
      }
    }

    if (f.lootTarget && (f.lootTarget.taken || now > f.lootUntil)) f.lootTarget = null;

    // unter Beschuss und angeschlagen: Deckung hinter einem Hindernis suchen
    if (t && f.style !== 'aggro' && f.hp < 65 && now - f.lastHitAt < 1500 && now > f.coverUntil) {
      const c = this.findCover(f, t);
      if (c) { f.coverX = c.x; f.coverY = c.y; f.coverUntil = now + 2600; }
    }
    if (now < f.coverUntil && !outside) {
      dx = f.coverX - f.x;
      dy = f.coverY - f.y;
      if (Math.hypot(dx, dy) < 18) { dx = 0; dy = 0; }
    } else if (t) {
      const ang = Math.atan2(t.y - f.y, t.x - f.x);
      const d = Math.hypot(t.x - f.x, t.y - f.y);
      const fleeHp = f.style === 'careful' ? 45 : f.style === 'aggro' ? 15 : 30;
      if (f.hp < fleeHp && t.hp > f.hp + 15) {
        dx = -Math.cos(ang);
        dy = -Math.sin(ang);
      } else {
        const pref = f.weapon.id === 'fists' ? 20 : f.weapon.range * (f.style === 'aggro' ? 0.35 : f.style === 'careful' ? 0.7 : 0.55);
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
        const l = this.findUsefulTarget(f, safe);
        if (l) {
          f.lootTarget = l;
          f.lootUntil = now + 7000;
        }
      }
      // vorsichtige Bots verstecken sich zwischendurch in Büschen
      if (!f.lootTarget && f.style === 'careful' && now > f.campUntil + 8000 && Math.random() < 0.08) {
        const b = this.bushes.filter((b) => (b.x - safe.x) ** 2 + (b.y - safe.y) ** 2 < (safe.r * 0.8) ** 2)
          .sort((a, c) => ((a.x - f.x) ** 2 + (a.y - f.y) ** 2) - ((c.x - f.x) ** 2 + (c.y - f.y) ** 2))[0];
        if (b && Math.hypot(b.x - f.x, b.y - f.y) < 600) { f.campX = b.x; f.campY = b.y; f.campUntil = now + 7000 + Math.random() * 6000; }
      }
      if (now < f.campUntil) {
        dx = f.campX - f.x;
        dy = f.campY - f.y;
        if (Math.hypot(dx, dy) < 14) { dx = 0; dy = 0; }
      } else if (this.followGap(f) > 340) {
        // beim Team bleiben
        const lead = this.teamLead(f)!;
        dx = lead.x - f.x;
        dy = lead.y - f.y;
      } else if (f.lootTarget) {
        dx = f.lootTarget.x - f.x;
        dy = f.lootTarget.y - f.y;
        // an der Kiste stehen bleiben, bis sie offen ist
        if (Math.hypot(dx, dy) < 50 && 'kind' in f.lootTarget && isContainer(f.lootTarget as Obstacle)) {
          dx = 0;
          dy = 0;
        }
      } else {
        if (now > f.wanderUntil || Math.hypot(f.wanderX - f.x, f.wanderY - f.y) < 60) {
          const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * safe.r * 0.7;
          f.wanderX = clamp(safe.x + Math.cos(a) * rr, 120, WORLD - 120);
          f.wanderY = clamp(safe.y + Math.sin(a) * rr, 120, WORLD - 120);
          f.wanderUntil = now + 4000 + Math.random() * 4000;
        }
        dx = f.wanderX - f.x;
        dy = f.wanderY - f.y;
      }
    }

    let len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len; dy /= len;
      // liegt das Ziel auf der anderen Flussseite? Dann zuerst zur nächsten Brücke
      const route = this.bridgeRoute(f, f.x + dx * 500, f.y + dy * 500);
      if (route) {
        const rl = Math.hypot(route.x - f.x, route.y - f.y) || 1;
        dx = (route.x - f.x) / rl; dy = (route.y - f.y) / rl;
        len = 1;
      }
    }
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

  /** Seite des Flusses (Vorzeichen des Abstands zur nächsten Flusslinie) */
  private riverSide(x: number, y: number) {
    const pts = this.map.river.pts;
    let best = Infinity, side = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy;
      const t = clamp(((x - a.x) * vx + (y - a.y) * vy) / l2, 0, 1);
      const px = a.x + vx * t, py = a.y + vy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < best) { best = d; side = Math.sign(vx * (y - a.y) - vy * (x - a.x)); }
    }
    return { side, dist: best };
  }

  /** Wegpunkt über eine Brücke, wenn das Ziel auf der anderen Flussseite liegt */
  private bridgeRoute(f: Fighter, tx: number, ty: number): { x: number; y: number } | null {
    const me = this.riverSide(f.x, f.y), goal = this.riverSide(tx, ty);
    if (me.side === goal.side || me.side === 0 || goal.side === 0) return null;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (const b of this.map.river.bridges) {
      const d = Math.hypot(b.x - f.x, b.y - f.y) + Math.hypot(b.x - tx, b.y - ty);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return null;
    const b = this.map.river.bridges.find((x) => x === best)!;
    // erst vor die Brücke, dann geradeaus darüber
    const n = b.angle + Math.PI / 2, off = this.map.river.width / 2 + 110;
    const ax = b.x + Math.cos(n) * off * me.side, ay = b.y + Math.sin(n) * off * me.side;
    const near = Math.hypot(ax - f.x, ay - f.y);
    const onBridge = Math.hypot(b.x - f.x, b.y - f.y) < off;
    if (onBridge || near < 40) {
      return { x: b.x - Math.cos(n) * off * me.side, y: b.y - Math.sin(n) * off * me.side };
    }
    return { x: ax, y: ay };
  }

  /** Anführer, dem ein Bot im Team folgt (Spieler oder erster Bot) */
  private teamLead(f: Fighter): Fighter | null {
    if (this.mode === 'solo') return null;
    const lead = f.team === this.player.team ? this.player : f.leader;
    return lead && lead !== f && lead.alive && lead.phase === 'ground' ? lead : null;
  }

  private followGap(f: Fighter) {
    const lead = this.teamLead(f);
    return lead ? Math.hypot(lead.x - f.x, lead.y - f.y) : 0;
  }

  /** Deckungspunkt hinter einem Hindernis, vom Angreifer aus gesehen */
  private findCover(f: Fighter, from: Fighter): { x: number; y: number } | null {
    let best = null as { x: number; y: number } | null;
    let bd = Infinity;
    this.query(f.x - 320, f.y - 320, f.x + 320, f.y + 320, (o) => {
      if (!o.blocks || isContainer(o)) return;
      const ax = o.x - from.x, ay = o.y - from.y, al = Math.hypot(ax, ay) || 1;
      const size = o.circle ? o.r : Math.max(o.w, o.h) / 2;
      if (size > 140) return;
      const p = { x: o.x + (ax / al) * (size + 30), y: o.y + (ay / al) * (size + 30) };
      const d = Math.hypot(p.x - f.x, p.y - f.y);
      if (d < bd && this.isFree(p.x, p.y, 20)) { bd = d; best = p; }
    });
    return best;
  }

  private isUseful(f: Fighter, k: LootKind) {
    if (k === 'ammo') return f.ammo < 90;
    if (k === 'armor') return f.armor < 100;
    // Heilung wird sofort verbraucht: nur nützlich, wenn Leben fehlt
    if (k === 'medkit') return f.hp < (f.isPlayer ? 100 : 85);
    if (k === 'bigmed') return f.hp < (f.isPlayer ? 100 : 60);
    return WEAPONS[k.slice(2) as WeaponId].tier > f.weapon.tier;
  }

  private hasNoWeapon(f: Fighter) {
    return f.weapon.id === 'fists';
  }

  private findUsefulTarget(f: Fighter, safe: Circle): Target | null {
    let best: Target | null = null;
    let bestD = (this.hasNoWeapon(f) ? 1100 : 700) ** 2;
    const inSafe = (x: number, y: number) => (x - safe.x) ** 2 + (y - safe.y) ** 2 < safe.r * safe.r;
    for (const l of this.loot) {
      if (l.taken || !this.isUseful(f, l.kind)) continue;
      const d = (l.x - f.x) ** 2 + (l.y - f.y) ** 2;
      if (d < bestD && inSafe(l.x, l.y)) { best = l; bestD = d; }
    }
    // fallende Versorgungspakete: Landeplatz ansteuern
    for (const d of this.airdrops) {
      if (d.obstacle) continue;
      const dist = ((d.x - f.x) ** 2 + (d.y - f.y) ** 2) * (f.style === 'careful' ? 0.6 : 0.2);
      if (dist < bestD && inSafe(d.x, d.y)) { best = { x: d.x, y: d.y, get taken() { return !!d.obstacle; } }; bestD = dist; }
    }
    // Kisten sind wertvoll: zählen wie halbe Entfernung
    for (const o of this.obstacles) {
      if (!isContainer(o) || o.opened) continue;
      const d = ((o.x - f.x) ** 2 + (o.y - f.y) ** 2) * (o.kind === 'crate' ? 0.5 : 0.2);
      if (d < bestD && inSafe(o.x, o.y)) { best = o; bestD = d; }
    }
    return best;
  }

  // ---------- Loot & Kisten ----------

  private updatePickups() {
    this.nearbyWeapon = null;
    let nearD = 38 * 38;
    for (const l of this.loot) {
      if (l.taken) continue;
      for (const f of this.fighters) {
        if (!f.alive || f.phase !== 'ground' || f.downed) continue;
        const d2 = (f.x - l.x) ** 2 + (f.y - l.y) ** 2;
        if (d2 > PICKUP_R * PICKUP_R) continue;
        if (!f.isPlayer && this.tryPickup(f, l, false)) break;
        if (f.isPlayer && l.kind.startsWith('w:') && d2 < nearD) {
          nearD = d2;
          this.nearbyWeapon = l;
        }
      }
    }
    this.loot = this.loot.filter((l) => !l.taken);

  }

  /** Öffnen der Kisten: jedes Bild, damit der Ring flüssig läuft */
  private updateContainers(dt: number) {
    for (const o of this.obstacles) {
      if (!isContainer(o) || o.opened) continue;
      let near = false;
      for (const f of this.fighters) {
        if (!f.alive || f.phase !== 'ground' || f.downed) continue;
        const cx = clamp(f.x, o.rect.x, o.rect.x + o.rect.w), cy = clamp(f.y, o.rect.y, o.rect.y + o.rect.h);
        if (Math.hypot(f.x - cx, f.y - cy) <= FIGHTER_R + CRATE_REACH) {
          near = true;
          o.playerNear = f.isPlayer;
          break;
        }
      }
      o.progress = near ? o.progress + (dt * 1000) / OPEN_TIME[o.kind] : Math.max(0, o.progress - dt);
      if (o.progress >= 1) this.openCrate(o);
    }
  }

  private openCrate(o: Obstacle) {
    o.opened = true;
    o.taken = true;
    o.progress = 1;
    const w = Math.random();
    const extras: LootKind[] = ['armor', 'medkit', 'ammo', 'bigmed'];
    const pickExtra = () => extras[Math.floor(Math.random() * extras.length)];
    let kinds: LootKind[];
    if (o.kind === 'airdrop') {
      kinds = [w < 0.5 ? 'w:minigun' : 'w:rocket', 'armor', 'bigmed', 'ammo'];
    } else if (o.kind === 'chest') {
      kinds = [w < 0.28 ? 'w:smg' : w < 0.5 ? 'w:shotgun' : w < 0.85 ? 'w:rifle' : 'w:sniper', 'ammo', pickExtra()];
      if (Math.random() < 0.4) kinds.push(pickExtra());
    } else {
      kinds = [w < 0.32 ? 'w:smg' : w < 0.56 ? 'w:shotgun' : w < 0.9 ? 'w:rifle' : 'w:sniper', pickExtra()];
      if (Math.random() < 0.35) kinds.push(pickExtra());
    }
    const off = Math.random() * Math.PI * 2;
    const hi = this.houseAt(o.x, o.y);
    const insideChest = (x: number, y: number) => Math.abs(x - o.x) < o.w / 2 + 30 && Math.abs(y - o.y) < o.h / 2 + 30;
    const taken: { x: number; y: number }[] = [];
    kinds.forEach((k, i) => {
      let p = { x: o.x, y: o.y + o.h / 2 + 50 };
      // mehrere Winkel probieren: außerhalb der Kiste, im Haus, nicht auf anderem Loot
      for (let tries = 0; tries < 16; tries++) {
        const a = off + ((i + tries * 0.37) / kinds.length) * Math.PI * 2;
        const dist = Math.max(o.w, o.h) / 2 + 50 + (tries % 3) * 18;
        let q = this.findFreeNear(o.x + Math.cos(a) * dist, o.y + Math.sin(a) * dist);
        if (hi >= 0) {
          // Inhalt bleibt im Haus und fällt nicht durch die Wand
          const h = this.houses[hi], m = h.s / 2 - 48;
          q = { x: clamp(q.x, h.x - m, h.x + m), y: clamp(q.y, h.y - m, h.y + m) };
        }
        if (insideChest(q.x, q.y) || taken.some((t) => Math.hypot(t.x - q.x, t.y - q.y) < 45)) continue;
        p = q;
        break;
      }
      if (hi >= 0) {
        // auch der Notfall-Platz bleibt im Haus
        const h = this.houses[hi], m = h.s / 2 - 48;
        p = { x: clamp(p.x, h.x - m, h.x + m), y: clamp(p.y, h.y - m, h.y + m) };
      }
      taken.push(p);
      this.spawnLoot(p.x, p.y, k, true, { x: o.x, y: o.y });
    });
    const byPlayer = !!o.playerNear;
    if (byPlayer) { if (o.kind === 'airdrop') this.stats.airdrops++; else this.stats.chests++; }
    this.events.push({ type: 'crate', o, byPlayer });
  }

  /** Spieler: Gegenstände werden mit Zeitring aufgehoben */
  private updatePlayerPick(f: Fighter, dt: number) {
    // automatisch: nützliche Verbrauchsgüter, auf denen man steht
    if (!this.pick || this.pick.loot.taken) {
      this.pick = null;
      let best: Loot | null = null, bd = PICKUP_R * PICKUP_R;
      // Touch: Waffen werden aufgenommen, wenn man kurz darauf stehen bleibt
      const standing = Math.hypot(f.vx, f.vy) < 45;
      for (const l of this.loot) {
        if (l.taken) continue;
        if (l.kind.startsWith('w:')) {
          if (!this.input.autoWeapon || !standing || l.kind === `w:${f.weapon.id}` || (f.backup && l.kind === `w:${f.backup.w.id}`)) continue;
        } else if (!this.isUseful(f, l.kind)) continue;
        const d = (l.x - f.x) ** 2 + (l.y - f.y) ** 2;
        if (d < bd) { bd = d; best = l; }
      }
      if (best) this.pick = { loot: best, t: 0, total: pickTime(best.kind) };
    }
    const p = this.pick;
    if (!p) return;
    const d = Math.hypot(p.loot.x - f.x, p.loot.y - f.y);
    if (d > PICKUP_R + 14) { this.pick = null; return; }
    if (this.input.autoWeapon && p.loot.kind.startsWith('w:') && Math.hypot(f.vx, f.vy) > 70) { this.pick = null; return; }
    p.t += dt * 1000;
    if (p.t >= p.total) {
      this.tryPickup(f, p.loot, p.loot.kind.startsWith('w:'));
      this.pick = null;
    }
  }

  tryPickup(f: Fighter, l: Loot, manual: boolean): boolean {
    const k = l.kind;
    if (k === 'ammo') {
      if (f.ammo >= 150) return false;
      f.ammo = Math.min(180, f.ammo + 40);
    } else if (k === 'armor') {
      if (f.armor >= 100) return false;
      f.armor = Math.min(100, f.armor + 50);
      if (f.isPlayer) this.stats.shields++;
    } else if (k === 'medkit' || k === 'bigmed') {
      if (f.hp >= 100 || f.healUntil) return false;
      // kurze Nutzungszeit (0,5 s), dann wird geheilt
      f.healAmt = k === 'bigmed' ? 70 : 30;
      f.healUntil = this.time + 500;
      if (f.isPlayer) this.stats.heals++;
    } else {
      const w = WEAPONS[k.slice(2) as WeaponId];
      if (!manual && (f.isPlayer || w.tier <= f.weapon.tier)) return false;
      const old = f.weapon, oldMag = f.mag;
      f.weapon = w;
      f.mag = w.mag;
      f.reloading = false;
      this.events.push({ type: 'weapon', f });
      if (old.id === 'fists') {
        // erste Waffe: Fäuste werden einfach ersetzt
      } else if (f.isPlayer && !f.backup) {
        // zweiter Platz frei: alte Waffe wandert dorthin
        f.backup = { w: old, mag: oldMag };
      } else if (old.id !== 'pistol' || manual) {
        this.spawnLoot(l.x + 8, l.y + 8, `w:${old.id}` as LootKind);
      }
    }
    l.taken = true;
    this.events.push({ type: 'take', loot: l });
    if (f.isPlayer) this.events.push({ type: 'pickup', f });
    return true;
  }

  // ---------- Zone ----------

  private updateZone(now: number) {
    if (this.zoneState === 'done' || now < this.phaseStart) return;
    const p = PHASES[this.phase];
    if (this.zoneState === 'wait' && now - this.phaseStart >= p.wait) {
      this.zoneState = 'shrink';
      this.zoneFrom = { ...this.zoneCur };
      this.phaseStart = now;
      this.events.push({ type: 'toast', text: 'Die Zone schrumpft!', color: '#7fb2ff' });
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

  private zoneDamage() {
    const dps = PHASES[this.phase].dps * (this.zoneState === 'done' ? 1.5 : 1);
    for (const f of this.fighters) {
      if (!f.alive || f.phase !== 'ground') continue;
      if (Math.hypot(f.x - this.zoneCur.x, f.y - this.zoneCur.y) > this.zoneCur.r) this.damage(f, dps * 0.5, null, true, 'Zone');
    }
  }

  zoneInfo() {
    const now = this.time;
    if (now < PLANE_TIME && this.player.phase === 'plane') return { text: 'Springe ab! (Leertaste / Springen)', urgent: false };
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
    return p.alive && p.phase === 'ground' && Math.hypot(p.x - this.zoneCur.x, p.y - this.zoneCur.y) > this.zoneCur.r;
  }

  houseAt(x: number, y: number): number {
    for (let i = 0; i < this.houses.length; i++) {
      const h = this.houses[i], hs = h.s / 2;
      if (x > h.x - hs && x < h.x + hs && y > h.y - hs && y < h.y + hs) return i;
    }
    return -1;
  }

  private updateCover(now: number) {
    const p = this.player;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      f.inBush = false;
      if (f.phase === 'ground') {
        for (const gf of this.map.grass) {
          if ((f.x - gf.x) ** 2 + (f.y - gf.y) ** 2 < (gf.r * 0.9) ** 2) { f.inBush = true; break; }
        }
        if (!f.inBush) for (const b of this.bushes) {
          if ((f.x - b.x) ** 2 + (f.y - b.y) ** 2 < (b.r * 0.72) ** 2) {
            f.inBush = true;
            break;
          }
        }
      }
      f.hidden = !f.isPlayer && f.inBush && now - f.lastFiredAt > 900 && (!p.alive || Math.hypot(f.x - p.x, f.y - p.y) > 140);
    }
  }
}
