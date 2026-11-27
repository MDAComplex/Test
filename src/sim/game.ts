import { WORLD, FIGHTER_COUNT, FIGHTER_R, PLAYER_SPEED, BOT_SPEED, PLANE_Z, FALL_SPEED, PLANE_TIME } from '../config';
import { WEAPONS, WeaponId, WeaponDef, parseWeapon, wKind, weaponScore, rollRarity, CHEST_RARITY, CRATE_RARITY, RARITY_NAMES } from '../weapons';
import { MapData, LootKind, Obs, House } from '../mapgen';
import { botNames, BODY_COLORS, PLAYER_COLOR } from '../names';
import { recordResult } from '../storage';
import type { ChuteDesign } from '../chute';
import type { WrapId } from '../wraps';

/** Bots tragen ab und zu ein Outfit, damit man die neuen Skins im Spiel sieht */
const BOT_OUTFIT = () => {
  const r = Math.random();
  return r < 0.1 ? 'astronaut' : r < 0.2 ? 'skeleton' : r < 0.3 ? 'office' : r < 0.4 ? 'jogger' : 'none';
};

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
  /** von einer goldenen (legendären) Waffe: eigener Schuss-Look */
  gold?: boolean;
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
  | { type: 'chute'; f: Fighter }
  | { type: 'land'; f: Fighter }
  | { type: 'gameover'; result: GameResult }
  | { type: 'down'; f: Fighter; by: Fighter | null }
  | { type: 'revive'; f: Fighter }
  | { type: 'playerOut' };

export type Phase = 'plane' | 'fall' | 'ground';
/** Position im Freifall bei Fortschritt u (0..1); Spieler und Bots folgen derselben Bahn zu ihrem Punkt */
export function freefallPos(f: { landX: number; landY: number; id: number }, u: number) {
  const side = f.id % 2 ? 1 : -1;
  // vorwärts und abwärts gemeinsam (aus Sicht der Kamera: gleichmäßig von unten zur Bildmitte),
  // schnell herein, zum Ende hin ruhiger; dazu ein Bogen zur Seite und leichtes Pendeln
  // Anfang wie bisher, aber am Ende nicht bis zum Stillstand abbremsen (sonst „hängt“ man kurz vor dem Schirm)
  const e = 0.3 * u + 0.7 * (1 - Math.pow(1 - u, 2));
  // Bogen und Pendeln nur am Anfang; zum Ende laufen Auslenkung UND Seitwärtsbewegung gegen null,
  // damit die Figur beim Öffnen des Schirms gerade und mittig ist
  const settle = (1 - u) * (1 - u);
  const arc = Math.sin(u * Math.PI) * (1 - u) * 1.6 * FREE_ARC * side;
  const sway = Math.sin(u * Math.PI * 3) * 22 * settle;
  const bob = Math.sin(u * Math.PI * 2) * 25 * settle;
  return { x: f.landX + arc + sway, y: f.landY + (1 - e) * FREE_BACK, z: DROP_Z + (CHUTE_Z - DROP_Z) * e + bob };
}

/** Höhe, auf der sich der Fallschirm öffnet (darüber: Freifall ohne Lenken) */
export const CHUTE_Z = 230;
/** Absprunghöhe: höher als früher, damit der Freifall länger und realistischer wirkt */
export const DROP_Z = 1250;
/** Dauer des Freifalls (s): die Figur fliegt von hinter der Kamera in einem Bogen nach vorne zum Landepunkt */
export const FREEFALL_TIME = 4.5;
/** Startabstand hinter dem Landepunkt (im Bild unten, nah an der Kamera) und seitlicher Bogen */
export const FREE_BACK = 760;
const FREE_ARC = 110;
const CHUTE_SPEED = CHUTE_Z / 4.2;
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
  /** Persönlichkeit: Jäger sucht Kämpfe, Camper hält Häuser, Looter sammelt erst alles, Ratte versteckt sich bis zu den Top 5 */
  persona: 'hunter' | 'camper' | 'looter' | 'rat' | 'normal' = 'normal';
  /** Zonen-Rotation: wie früh (ms) der Bot zur nächsten Zone aufbricht, und sein Zielpunkt darin */
  rotEarly = 0; rotX = 0; rotY = 0; rotKey = -1;
  /** Haus halten: Platz innen an der Tür */
  holdX = 0; holdY = 0; holdAim = 0; holdHouse = -1;
  /** kurzes Stehenbleiben beim Ausweichen */
  stopUntil = 0;
  /** an der Deckung rauslehnen: wann und zu welcher Seite */
  peekUntil = 0; peekNext = 0; peekSide = 1;
  /** Rückzug nach starkem Schaden, danach Rache am Angreifer */
  retreatUntil = 0; revengeUntil = 0;
  /** zuletzt gesehener Gegner (auch wenn er sich hinter einer Wand versteckt) */
  memory: { who: Fighter; x: number; y: number; t: number } | null = null;
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
  /** Bot-Können: 0.65 schwach, 1 normal, 1.35 stark */
  skill = 1;
  strafeUntil = 0;
  /** Bot hebt gerade etwas auf (braucht wie der Spieler Zeit) */
  pickLoot: Loot | null = null;
  pickT = 0;
  /** Aussehen: Figur und Fallschirm */
  look: { char: 'man' | 'woman' | 'jackal' | 'luchador'; chute: 'round' | 'wing'; outfit?: 'none' | 'astronaut' | 'skeleton' | 'office' | 'jogger'; design?: ChuteDesign; wrap?: WrapId } = { char: 'man', chute: 'round', outfit: 'none' };
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
export const PICK_TIME: Record<string, number> = { ammo: 350, ammo6: 450, weapon: 600, armor: 900, medkit: 900, bigmed: 1250, crate: CRATE_TIME };
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
  k === 'ammo' ? 'Munition' : k === 'ammo6' ? 'Munition (groß)' : k === 'armor' ? 'Rüstung' : k === 'medkit' ? 'Kleines Medikit' : k === 'bigmed' ? 'Großes Medikit' : `${parseWeapon(k).name} (${RARITY_NAMES[parseWeapon(k).tier]})`;

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
  /** zuletzt gehörte Schüsse (für Bots: hinlaufen oder meiden) */
  private shotsHeard: { x: number; y: number; t: number; by: Fighter }[] = [];
  /** laufende Kämpfe (wer trifft wen), für Dritt-Parteien */
  private fights: { x: number; y: number; t: number; a: Fighter; v: Fighter }[] = [];
  airdrops: Airdrop[] = [];
  private nextAirdrop = 0;
  over = false;
  result: GameResult | null = null;
  input = { mx: 0, my: 0, aim: null as number | null, firing: false, autoWeapon: false, fpp: false, jump: false, heal: false, reload: false, pickup: false, swap: false };
  /** Zähler für Aufgaben und Erfahrungspunkte */
  stats = { chests: 0, airdrops: 0, shields: 0, heals: 0, damage: 0 };
  /** Kamera folgt nach dem Tod diesem Kämpfer */
  spectate: Fighter | null = null;
  nearbyWeapon: Loot | null = null;
  /** Was der Spieler gerade aufhebt (Ring-Fortschritt) */
  pick: { loot: Loot; t: number; total: number } | null = null;
  nextPickup = 0;
  nextZoneTick = 0;
  private ids = 1;

  /** gewählter Landepunkt des Spielers (in der Auswahlphase) */
  dropPick: { x: number; y: number } | null = null;
  private dropPickAt = 0;
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
      const cr = Math.random();
      f.look = { char: cr < 0.06 ? 'jackal' : cr < 0.12 ? 'luchador' : cr < 0.56 ? 'man' : 'woman', chute: Math.random() < 0.5 ? 'round' : 'wing', outfit: BOT_OUTFIT() };
      f.strafe = Math.random() < 0.5 ? 1 : -1;
      const st = Math.random();
      f.style = st < 0.3 ? 'aggro' : st < 0.6 ? 'careful' : 'normal';
      const pr = Math.random();
      // dezent: die meisten spielen normal, die Persönlichkeit färbt nur leicht ab
      f.persona = pr < 0.15 ? 'hunter' : pr < 0.27 ? 'camper' : pr < 0.45 ? 'looter' : pr < 0.53 ? 'rat' : 'normal';
      if (f.persona === 'hunter' && Math.random() < 0.6) f.style = 'aggro';
      else if (f.persona === 'rat' && Math.random() < 0.6) f.style = 'careful';
      // manche brechen früh zur Zone auf, andere (vor allem Looter) spät
      f.rotEarly = -6000 + Math.random() * 22000 + (f.persona === 'looter' ? -7000 : f.persona === 'rat' ? 6000 : 0);
      const sk = Math.random();
      f.skill = sk < 0.3 ? 0.65 : sk < 0.85 ? 1 : 1.35;
      // erster Bot eines Teams plant den Absprung, die anderen folgen ihm
      const lead = this.fighters.find((x) => x.team === f.team && x !== f) ?? null;
      f.leader = lead;
      if (lead && !lead.isPlayer) {
        f.landX = lead.landX + (Math.random() - 0.5) * 220;
        f.landY = lead.landY + (Math.random() - 0.5) * 220;
      } else {
        this.planBotDrop(f);
      }
    }
    for (const f of this.fighters) { f.x = WORLD / 2; f.y = WORLD / 2; }

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

  /** Bots wählen ihren Landepunkt: meist bei einem Haus (Loot), sonst irgendwo auf der Insel */
  private planBotDrop(f: Fighter) {
    let x: number, y: number;
    if (Math.random() < 0.6 && this.houses.length) {
      const h = this.houses[Math.floor(Math.random() * this.houses.length)];
      const a = Math.random() * Math.PI * 2;
      x = h.x + Math.cos(a) * (h.s / 2 + 80 + Math.random() * 120);
      y = h.y + Math.sin(a) * (h.s / 2 + 80 + Math.random() * 120);
    } else {
      x = 400 + Math.random() * (WORLD - 800);
      y = 400 + Math.random() * (WORLD - 800);
    }
    const spot = this.findFreeNear(clamp(x, 300, WORLD - 300), clamp(y, 300, WORLD - 300));
    f.landX = spot.x;
    f.landY = spot.y;
  }

  /** Spieler wählt seinen Landepunkt (nur in der Auswahlphase) */
  chooseDrop(x: number, y: number) {
    if (this.time >= PLANE_TIME || this.player.phase !== 'plane') return;
    this.dropPick = { x: clamp(x, 300, WORLD - 300), y: clamp(y, 300, WORLD - 300) };
    this.dropPickAt = this.time;
  }

  /** Sekunden bis zum Absprung */
  dropLeft() {
    return Math.max(0, (PLANE_TIME - this.time) / 1000);
  }

  spawnLoot(x: number, y: number, kind: LootKind, announce = true, from?: { x: number; y: number }) {
    // nie ins Wasser fallen lassen (z. B. Beute eines Spielers, der am Ufer besiegt wurde)
    const dry = this.dryPoint(clamp(x, 40, WORLD - 40), clamp(y, 40, WORLD - 40));
    const l: Loot = { id: this.ids++, kind, x: dry.x, y: dry.y, taken: false, from };
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
    const end = now >= PLANE_TIME;
    const p = this.player;
    // Auswahlphase: Mitspieler-Bots schließen sich nach kurzer Zeit dem Punkt des Spielers an
    if (!end && this.dropPick && this.mode !== 'solo') {
      for (const m of this.teammates(p)) {
        if (m.phase !== 'plane' || now < this.dropPickAt + 700 + (m.id % 3) * 600) continue;
        const k = m.id % 3;
        m.landX = this.dropPick.x + (k - 1) * 110;
        m.landY = this.dropPick.y + (k === 1 ? 90 : -60);
      }
    }
    if (end && p.phase === 'plane' && !this.dropPick) {
      // nichts gewählt: im Team zu einem Mitspieler, sonst zufällig
      const mate = this.mode !== 'solo' ? this.teammates(p)[0] : null;
      if (mate) this.dropPick = { x: mate.landX + 90, y: mate.landY + 70 };
      else { this.planBotDrop(p); this.dropPick = { x: p.landX, y: p.landY }; }
    }
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (f.phase === 'plane') {
        if (!end) continue;
        const spot = f.isPlayer ? this.dropPick! : { x: f.landX, y: f.landY };
        f.landX = spot.x; f.landY = spot.y;
        f.phase = 'fall';
        // alle springen gleich (Spieler und Bots), damit es später auch online identisch läuft;
        // Start etwas hinter dem Punkt, weil man im Freifall nach vorne treibt
        f.z = DROP_Z;
        f.jumpAt = now;
        f.landX = clamp(spot.x, 60, WORLD - 60);
        f.landY = clamp(spot.y, 60, WORLD - 60);
        f.x = f.landX;
        f.y = f.landY + FREE_BACK;
        f.vx = f.vy = 0;
        this.events.push({ type: 'jump', f });
      } else if (f.phase === 'fall') {
        const free = f.z > CHUTE_Z;
        if (free) {
          // feste Bahn (für alle gleich): nach vorne gleiten, weicher Bogen zur Seite, leichtes Pendeln,
          // endet genau über dem Landepunkt auf Schirmhöhe
          const u = Math.min(1, (now - f.jumpAt) / 1000 / FREEFALL_TIME);
          const pos = freefallPos(f, u);
          if (dt > 0) { f.vx = (pos.x - f.x) / dt; f.vy = (pos.y - f.y) / dt; }
          f.x = pos.x; f.y = pos.y; f.z = pos.z;
          if (u >= 1) f.z = CHUTE_Z - 0.01;
        } else f.z -= CHUTE_SPEED * dt;
        if (free && f.z <= CHUTE_Z) this.events.push({ type: 'chute', f });
        // tief über einem Haus: vom Dach seitlich abrutschen, damit niemand ins Haus fällt
        if (f.z < 120) this.pushOutOfHouse(f);
        if (f.z <= 0) {
          f.z = 0;
          f.phase = 'ground';
          this.pushOutOfHouse(f);
          const q = this.findFreeNear(f.x, f.y);
          f.x = q.x;
          f.y = q.y;
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
    this.query(f.x - R - 110, f.y - R - 110, f.x + R + 110, f.y + R + 110, (o) => {
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
    this.keepOutOfRiver(f);
  }

  /** liegt der Punkt im Fluss (nicht auf einer Brücke) oder in einem Teich? */
  private wet(x: number, y: number, pad = 0) {
    const rv = this.map.river, pts = rv.pts;
    if (!this.onBridge(x, y)) {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
        const t = clamp(((x - a.x) * vx + (y - a.y) * vy) / l2, 0, 1);
        if (Math.hypot(x - a.x - vx * t, y - a.y - vy * t) < rv.width / 2 + pad) return true;
      }
    }
    return this.map.ponds.some((pd) => Math.hypot(pd.x - x, pd.y - y) < pd.r + pad);
  }

  /** Punkt an Land: liegt er im Wasser, wird der nächste trockene Punkt gesucht */
  private dryPoint(x: number, y: number) {
    if (!this.wet(x, y, 12)) return { x, y };
    for (let r = 20; r < 700; r += 20) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
        const px = clamp(x + Math.cos(a) * r, 60, WORLD - 60), py = clamp(y + Math.sin(a) * r, 60, WORLD - 60);
        if (!this.wet(px, py, 20)) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  /** Brücke, auf deren Deck der Punkt liegt (zwischen den Geländern), sonst null */
  onBridge(x: number, y: number) {
    const rv = this.map.river, half = (rv.width + 150) / 2;
    for (const b of rv.bridges) {
      const ca = Math.cos(b.angle), sa = Math.sin(b.angle), dx = x - b.x, dy = y - b.y;
      const along = dx * ca + dy * sa, across = -dx * sa + dy * ca;
      if (Math.abs(along) < 60 && Math.abs(across) < half) return b;
    }
    return null;
  }

  /** exakte Wasserprüfung entlang der Flusslinie: wer im Fluss steht (und nicht auf einer Brücke), wird ans Ufer geschoben */
  private keepOutOfRiver(f: Fighter) {
    const rv = this.map.river, pts = rv.pts;
    const half = rv.width / 2 + FIGHTER_R * 0.5;
    let best = Infinity, nx = 0, ny = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y, l2 = vx * vx + vy * vy || 1;
      const t = clamp(((f.x - a.x) * vx + (f.y - a.y) * vy) / l2, 0, 1);
      const px = a.x + vx * t, py = a.y + vy * t;
      const d = Math.hypot(f.x - px, f.y - py);
      if (d < best) { best = d; nx = px; ny = py; }
    }
    if (best >= half || this.onBridge(f.x, f.y)) return;
    let dx = f.x - nx, dy = f.y - ny;
    if (best < 0.001) { dx = 1; dy = 0; best = 1; }
    f.x = nx + (dx / best) * half;
    f.y = ny + (dy / best) * half;
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
    if (f.phase === 'fall') return f.z > CHUTE_Z ? 0 : f.isPlayer ? 150 : 140;
    if (f.downed) return 48;
    const base = f.isPlayer ? PLAYER_SPEED : BOT_SPEED;
    return base * f.weapon.moveMul * (f.aiming ? 0.7 : 1) * (f.healUntil ? 0.5 : 1);
  }

  /** Weiches Beschleunigen/Abbremsen statt sofortiger Richtungswechsel */
  private drive(f: Fighter, dx: number, dy: number, speed: number, dt: number) {
    // Freifall: Bewegung kommt allein aus updateDrop (Gleiten und Pendeln)
    if (f.phase === 'fall' && f.z > CHUTE_Z) return;
    const active = dx !== 0 || dy !== 0;
    // scharfer Richtungswechsel kostet bis zu 10 % Tempo
    const cur = Math.hypot(f.vx, f.vy), want = Math.hypot(dx, dy);
    if (active && cur > 30 && want > 0) {
      const dot = (f.vx * dx + f.vy * dy) / (cur * want);
      // nur ein kleiner Tempoverlust bei Kehrtwenden (max. 5 %)
      speed *= 1 - 0.05 * (1 - dot) / 2;
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
    if (a !== null && this.input.fpp) {
      // Ich-Perspektive: Figur schaut immer in Blickrichtung
      f.aim = a;
    } else if (a !== null && this.input.firing) {
      // nur beim Schießen zum Ziel drehen (sofort, damit der Schuss sitzt)
      f.aim = a;
    } else if (now - f.lastShot < 300) {
      // kurz nach dem Schuss in Schussrichtung bleiben
    } else if (f.moveX || f.moveY) {
      // sonst immer in Laufrichtung (WASD / linker Stick) schauen
      f.aim = rotateTo(f.aim, Math.atan2(f.moveY, f.moveX), 0.25);
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
    if (f.target) f.memory = { who: f.target, x: f.target.x, y: f.target.y, t: now };
    else if (f.memory && (!f.memory.who.alive || now - f.memory.t > 6000)) f.memory = null;

    // Raketenwerfer: Gegner, der sich gerade hinter Deckung versteckt hat, wird herausgesprengt
    if (!f.target && f.weapon.splash && f.memory && now - f.memory.t < 2500 && f.mag > 0 && !f.reloading) {
      const m = f.memory, d = Math.hypot(m.x - f.x, m.y - f.y);
      if (d > f.weapon.splash + 40 && d < f.weapon.range) {
        f.aim = rotateTo(f.aim, Math.atan2(m.y - f.y, m.x - f.x), 0.35);
        if (Math.abs(wrap(Math.atan2(m.y - f.y, m.x - f.x) - f.aim)) < 0.08) this.tryFire(f, now);
        return;
      }
    }

    if (f.target) {
      const ang = Math.atan2(f.target.y - f.y, f.target.x - f.x);
      f.aim = rotateTo(f.aim, ang + (f.isPlayer ? 0 : f.aimError), 0.35);
    } else if (f.moveX || f.moveY) {
      f.aim = rotateTo(f.aim, Math.atan2(f.moveY, f.moveX), 0.2);
    }

    const canFire = f.target && !f.healUntil && now - f.targetSince > 650 / f.skill;
    if (canFire) this.tryFire(f, now);
    else if (!f.target && f.mag < f.weapon.mag && f.ammo > 0 && now - f.lastShot > 1500) this.startReload(f, now);
  }

  private findTarget(f: Fighter, now: number): Fighter | null {
    let best: Fighter | null = null;
    // Bots greifen anfangs zurückhaltender an, später voll
    const ramp = clamp(0.5 + ((now - PLANE_TIME) / 150000) * 0.5, 0.5, 1);
    const styleK = f.style === 'aggro' ? 1.05 : f.style === 'careful' ? 0.8 : 0.92;
    // ohne Waffe nur Gegner direkt in der Nähe angreifen, sonst zuerst Waffe suchen
    let bestD = f.weapon.id === 'fists' ? 95 : f.weapon.range * (f.isPlayer ? 1 : ramp * styleK);
    if (!f.isPlayer && f.weapon.id !== 'fists') {
      const attacked = now - f.lastHitAt < 3000;
      // Ratte: bis zu den Top 5 nur kämpfen, wenn sie angegriffen wird oder jemand ganz nah ist
      if (f.persona === 'rat' && !attacked && this.aliveCount() > 5) bestD *= 0.6;
      // Looter: erst ausrüsten, vorher nur in der Nähe kämpfen
      else if (f.persona === 'looter' && !attacked && !this.geared(f, now)) bestD *= 0.85;
      else if (f.persona === 'hunter') bestD *= 1.06;
    }
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
    // Raketen starten in der Körpermitte, damit sie an einer Wand direkt vor einem sicher explodieren
    const mo = w.splash ? 4 : 20;
    const sx = f.x + Math.cos(f.aim) * mo, sy = f.y + Math.sin(f.aim) * mo;
    for (let i = 0; i < w.pellets; i++) {
      const a = f.aim + (Math.random() - 0.5) * 2 * (w.spread + extra);
      this.bullets.push({
        id: this.ids++, x: sx, y: sy, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        owner: f, gold: w.tier === 5, dmg: f.isPlayer ? w.damage : w.damage * 0.85, traveled: 0, range: w.range * (w.splash ? 1 : 1.6), weapon: w.name, wid: w.id, dead: false, eff: w.range, strayed: false,
      });
    }
    if (!f.isPlayer) {
      // Bots: ungenauer auf Distanz, direkt nach dem Erfassen und nach eigenen Treffern
      const d = f.target ? Math.hypot(f.target.x - f.x, f.target.y - f.y) : w.range;
      const warm = Math.max(0, 1 - (now - f.targetSince) / 1400) * 0.3;
      const flinch = now < f.flinchUntil ? 0.35 : 0;
      f.aimError = ((Math.random() - 0.5) * 2 * (0.12 + (d / w.range) * 0.3 + warm + flinch)) / f.skill;
    }
    this.shotsHeard.push({ x: f.x, y: f.y, t: now, by: f });
    if (this.shotsHeard.length > 40) this.shotsHeard.shift();
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
        // Bots untereinander etwas weniger Schaden: Runden bleiben länger spannend
        if (!f.isPlayer && !b.owner.isPlayer) b.dmg *= 0.6;
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
      // hinter dünner Deckung trifft die Druckwelle noch, wenn man nah dran ist
      if (!this.hasLOS(x, y, f.x, f.y) && d > r * 0.55) continue;
      const k = Math.max(0.25, 1 - d / (r + FIGHTER_R));
      // auch der Schütze selbst bekommt vollen Schaden, wenn er im Explosionsradius steht
      this.damage(f, b.dmg * k, b.owner, false, b.weapon);
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
    if (attacker === this.player && f !== this.player) this.stats.damage += amount;
    if (attacker && attacker !== f) {
      this.fights.push({ x: (f.x + attacker.x) / 2, y: (f.y + attacker.y) / 2, t: this.time, a: attacker, v: f });
      if (this.fights.length > 40) this.fights.shift();
    }
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
    const self = attacker === f;
    f.killedBy = attacker;
    if (attacker && !self) attacker.kills++;
    const drops: LootKind[] = [];
    if (f.weapon.id !== 'fists') drops.push(wKind(f.weapon.id, f.weapon.tier));
    if (f.ammo >= 15) drops.push('ammo');
    if (f.armor >= 25) drops.push('armor');
    if (f.backup && f.backup.w.id !== 'pistol') drops.push(wKind(f.backup.w.id, f.backup.w.tier));
    const off = Math.random() * Math.PI;
    drops.forEach((k, i) => {
      const a = off + (i / drops.length) * Math.PI * 2;
      this.spawnLoot(f.x + Math.cos(a) * 32, f.y + Math.sin(a) * 32, k);
    });
    f.downed = false;
    const alive = this.aliveCount();
    this.events.push({
      type: 'kill', f,
      killer: self ? 'Selbst' : attacker ? attacker.name : 'Zone',
      victim: f.name,
      weapon: attacker ? weapon : 'Zone',
      mine: attacker === this.player && !self,
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

  /** gut ausgerüstet: brauchbare Waffe und etwas Schild (oder die Runde läuft schon lange) */
  private geared(f: Fighter, now: number) {
    return (weaponScore(f.weapon) >= 3 && f.armor >= 25) || now > PLANE_TIME + 120000;
  }

  /** Zone aus Sicht eines Bots: je nach Persönlichkeit früher oder später zur nächsten Zone */
  private botSafe(f: Fighter, now: number): Circle {
    if (this.zoneState === 'shrink') return this.zoneNext;
    if (this.zoneState === 'wait' && PHASES[this.phase].wait - (now - this.phaseStart) < 12000 + f.rotEarly) return this.zoneNext;
    return this.zoneCur;
  }

  /** Zielpunkt der Rotation in der nächsten Zone (pro Bot und Phase fest, damit nicht alle zur Mitte laufen) */
  private rotPoint(f: Fighter, c: Circle) {
    const key = this.phase * 10 + (c === this.zoneNext ? 1 : 0);
    if (f.rotKey !== key) {
      f.rotKey = key;
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * c.r * 0.55;
      f.rotX = clamp(c.x + Math.cos(a) * rr, 150, WORLD - 150);
      f.rotY = clamp(c.y + Math.sin(a) * rr, 150, WORLD - 150);
    }
    return { x: f.rotX, y: f.rotY };
  }

  /** Dritt-Partei: frischer Kampf in Hörweite, an dem der Bot nicht beteiligt ist */
  private thirdParty(f: Fighter, now: number) {
    if (f.weapon.id === 'fists') return null;
    const top5 = this.aliveCount() <= 5;
    // Third-Partying: fast alle machen mit, wenn sie fit und bewaffnet sind (Jäger aus größerer Entfernung)
    const fit = f.hp > 55;
    const range = !fit ? 0
      : f.persona === 'hunter' ? 1100
      : f.persona === 'rat' ? (top5 ? 800 : 0)
      : f.persona === 'looter' ? (this.geared(f, now) ? 800 : 500)
      : f.skill >= 1 ? 850 : 600;
    if (!range) return null;
    for (let i = this.fights.length - 1; i >= 0; i--) {
      const h = this.fights[i];
      if (now - h.t > 4000) break;
      if (h.a === f || h.v === f || this.ally(h.a, f) || this.ally(h.v, f)) continue;
      const d = Math.hypot(h.x - f.x, h.y - f.y);
      if (d > 120 && d < range) return h;
    }
    return null;
  }

  /** nächste Heilung (Medikit) in der Nähe */
  private nearestHeal(f: Fighter) {
    let best: Loot | null = null, bd = 800;
    for (const l of this.loot) {
      if (l.taken || (l.kind !== 'medkit' && l.kind !== 'bigmed')) continue;
      const d = Math.hypot(l.x - f.x, l.y - f.y);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  /** Versorgungspaket in Reichweite, das sich lohnt */
  private airdropGoal(f: Fighter) {
    if (f.persona === 'rat' && this.aliveCount() > 5) return null;
    const range = f.persona === 'hunter' ? 1600 : f.persona === 'looter' ? 1400 : f.persona === 'camper' ? 600 : f.weapon.id === 'fists' ? 500 : 1150;
    let best: { x: number; y: number } | null = null, bd = range;
    for (const d of this.airdrops) {
      if (d.obstacle && d.obstacle.opened) continue;
      const dist = Math.hypot(d.x - f.x, d.y - f.y);
      if (dist < bd) { bd = dist; best = { x: d.x, y: d.y }; }
    }
    return best;
  }

  /** Haus halten: Platz innen an der Tür, Blick nach draußen */
  private holdSpot(f: Fighter, hi: number) {
    const h = this.houses[hi];
    if (f.holdHouse !== hi && h.doors.length) {
      const d = h.doors[f.id % h.doors.length];
      f.holdHouse = hi;
      f.holdX = d.x - d.nx * 75;
      f.holdY = d.y - d.ny * 75;
      f.holdAim = Math.atan2(d.ny, d.nx);
    }
    return f.holdHouse === hi ? { x: f.holdX, y: f.holdY } : null;
  }

  safeCircle(now: number): Circle {
    if (this.zoneState === 'shrink') return this.zoneNext;
    if (this.zoneState === 'wait' && PHASES[this.phase].wait - (now - this.phaseStart) < 12000) return this.zoneNext;
    return this.zoneCur;
  }

  private think(f: Fighter, now: number) {
    f.nextThink = now + 220 + Math.random() * 120;
    if (f.phase === 'fall') {
      // im Freifall folgt jeder seiner festen Bahn, gelenkt wird erst am Schirm
      if (f.z > CHUTE_Z) { f.moveX = f.moveY = 0; return; }
      const lead = this.mode !== 'solo' ? (f.team === this.player.team ? this.player : f.leader) : null;
      if (lead && lead.alive) { f.landX = lead.x + ((f.id % 3) - 1) * 90; f.landY = lead.y + ((f.id % 2) ? 70 : -70); }
      const dx = f.landX - f.x, dy = f.landY - f.y, d = Math.hypot(dx, dy);
      f.moveX = d > 20 ? dx / d : 0;
      f.moveY = d > 20 ? dy / d : 0;
      return;
    }
    const safe = this.botSafe(f, now);
    const dSafe = Math.hypot(safe.x - f.x, safe.y - f.y) || 1;
    // gierige Looter sammeln in den ersten Zonen noch im Sturm weiter (manche erwischt es dabei)
    const greedy = f.persona === 'looter' && this.phase < 2 && f.hp > 70 && !!f.lootTarget;
    const outside = dSafe > Math.max(40, safe.r * 0.8) && !greedy;
    const inHouse = this.houseAt(f.x, f.y);
    const t = f.target;
    let dx = 0, dy = 0;
    let goal: { x: number; y: number } | null = null;
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
      if (hurt) {
        // nur EINER belebt wieder (der nächste Bot), die anderen sichern mit Abstand und Feuerschutz
        const standing = mates.filter((x) => !x.downed && !x.isPlayer);
        standing.push(f);
        const reviver = standing.sort((a, b) => Math.hypot(a.x - hurt.x, a.y - hurt.y) - Math.hypot(b.x - hurt.x, b.y - hurt.y))[0];
        const threat = hurt.downedBy && hurt.downedBy.alive ? hurt.downedBy : t;
        if (reviver === f && (!t || Math.hypot(t.x - f.x, t.y - f.y) > 450)) {
          const d = Math.hypot(hurt.x - f.x, hurt.y - f.y);
          f.moveX = d > 30 ? (hurt.x - f.x) / d : 0;
          f.moveY = d > 30 ? (hurt.y - f.y) / d : 0;
          return;
        }
        if (!t) {
          // Sicherungsposition: verteilt um den Verletzten, Richtung Gefahr, nicht alle auf einem Fleck
          const base = threat ? Math.atan2(threat.y - hurt.y, threat.x - hurt.x) : (f.id * 2.4) % (Math.PI * 2);
          const slot = ((f.id % 3) - 1) * 0.9;
          const gx = hurt.x + Math.cos(base + slot) * 200, gy = hurt.y + Math.sin(base + slot) * 200;
          const d = Math.hypot(gx - f.x, gy - f.y);
          f.moveX = d > 25 ? (gx - f.x) / d : 0;
          f.moveY = d > 25 ? (gy - f.y) / d : 0;
          if (threat) f.aim = rotateTo(f.aim, Math.atan2(threat.y - f.y, threat.x - f.x), 0.25);
          else if (d <= 25) f.aim = rotateTo(f.aim, base + slot, 0.2);
          return;
        }
        // mit Ziel: normal kämpfen (Feuerschutz), aber den Verletzten nicht zu weit zurücklassen
      }
    }

    if (f.lootTarget && (f.lootTarget.taken || now > f.lootUntil)) f.lootTarget = null;

    const alive = this.aliveCount();
    const tD = t ? Math.hypot(t.x - f.x, t.y - f.y) : 0;
    // Rückzug: stark angeschlagen und unter Beschuss -> echt fliehen, dann Heilung suchen und zurückkommen
    if (t && f.hp < (f.style === 'aggro' ? 25 : 40) && t.hp > f.hp + 10 && now > f.retreatUntil + 4000 && f.skill >= 0.8) {
      f.retreatUntil = now + 2600;
      f.revengeUntil = now + 20000;
      const c = this.findCover(f, t);
      if (c) { f.coverX = c.x; f.coverY = c.y; f.coverUntil = now + 2600; }
    }
    // unter Beschuss und angeschlagen: Deckung hinter einem Hindernis suchen; Vorsichtige spielen generell aus der Deckung
    const needCover = (f.hp < 65 && now - f.lastHitAt < 1500) || (f.reloading && f.skill >= 1) || (f.mag === 0 && f.weapon.id !== 'fists')
      || (f.style === 'careful' && tD > 220 && f.skill >= 1);
    if (t && f.style !== 'aggro' && needCover && now > f.coverUntil && (f.skill >= 1 || Math.random() < 0.4)) {
      const c = this.findCover(f, t);
      if (c) { f.coverX = c.x; f.coverY = c.y; f.coverUntil = now + 3200; }
    }
    // Mitspieler, die denselben Gegner angreifen (für Flankieren)
    const flankMate = t && this.mode !== 'solo'
      ? this.teammates(f).find((m) => m.alive && !m.isPlayer && !m.downed && m.target === t && m.id < f.id) ?? null : null;
    if (now < f.coverUntil && !outside) {
      dx = f.coverX - f.x;
      dy = f.coverY - f.y;
      const atCover = Math.hypot(dx, dy) < 22;
      if (atCover) { dx = 0; dy = 0; }
      // Peeken: kurz zur Seite raus, schießen, zurück; starke Bots wechseln dabei die Seite
      const m = f.memory;
      if (atCover && m && !f.reloading && f.mag > 0 && f.hp > 30 && now > f.retreatUntil) {
        if (now > f.peekNext) {
          if (f.skill >= 1.3) f.peekSide *= -1;
          else if (Math.random() < 0.25) f.peekSide *= -1;
          f.peekUntil = now + 550 + Math.random() * 450;
          f.peekNext = f.peekUntil + 700 + Math.random() * 900;
          f.coverUntil = Math.max(f.coverUntil, f.peekNext + 200);
        }
        if (now < f.peekUntil) {
          const ang = Math.atan2(m.y - f.y, m.x - f.x) + (Math.PI / 2) * f.peekSide;
          dx = Math.cos(ang); dy = Math.sin(ang);
        }
      }
    } else if (now < f.retreatUntil && t) {
      // Flucht weg vom Angreifer
      const ang = Math.atan2(t.y - f.y, t.x - f.x);
      dx = -Math.cos(ang) + Math.cos(ang + Math.PI / 2) * f.strafe * 0.4;
      dy = -Math.sin(ang) + Math.sin(ang + Math.PI / 2) * f.strafe * 0.4;
    } else if (t) {
      const ang = Math.atan2(t.y - f.y, t.x - f.x);
      const d = tD;
      const fleeHp = f.style === 'careful' ? 45 : f.style === 'aggro' ? 15 : 30;
      const unarmedVsGun = f.weapon.id === 'fists' && t.weapon.id !== 'fists' && d > 70;
      if ((f.hp < fleeHp && t.hp > f.hp + 15) || unarmedVsGun) {
        dx = -Math.cos(ang);
        dy = -Math.sin(ang);
      } else if (t.reloading && f.skill >= 1 && f.weapon.id !== 'fists' && d < f.weapon.range && d > 70) {
        // Gegner lädt nach: gute Bots stürmen direkt drauf zu
        dx = Math.cos(ang); dy = Math.sin(ang);
      } else if (flankMate) {
        // Flankieren: einer bindet von vorne, dieser läuft seitlich herum
        const base = Math.atan2(flankMate.y - t.y, flankMate.x - t.x) + (f.id % 2 ? 1.35 : -1.35);
        const pref = Math.max(120, f.weapon.range * 0.5);
        const gx = t.x + Math.cos(base) * pref, gy = t.y + Math.sin(base) * pref;
        dx = gx - f.x; dy = gy - f.y;
        if (Math.hypot(dx, dy) < 40) { dx = Math.cos(ang + Math.PI / 2) * f.strafe; dy = Math.sin(ang + Math.PI / 2) * f.strafe; }
      } else {
        let pref = f.weapon.id === 'fists' ? 20 : f.weapon.range * (f.style === 'aggro' ? 0.35 : f.style === 'careful' ? 0.7 : 0.55);
        // Taktik: angeschlagene Gegner bedrängen, mit größerer Reichweite auf Abstand halten
        if (t.hp + t.armor < 45 && f.hp > 55) pref = Math.min(pref, f.weapon.range * 0.3);
        else if (f.skill >= 1 && t.weapon.range < f.weapon.range * 0.8) pref = f.weapon.range * 0.78;
        const radial = d > pref + 50 ? 1 : d < pref - 50 ? -0.8 : 0;
        // Ausweichen: unregelmäßig die Seite wechseln, kurz stehen bleiben, dann wieder losrennen
        if (now > f.strafeUntil) {
          if (Math.random() < 0.65) f.strafe *= -1;
          f.strafeUntil = now + 250 + Math.random() * 800 / f.skill;
          if (f.skill >= 1 && Math.random() < 0.3) f.stopUntil = now + 180 + Math.random() * 220;
        }
        if (now < f.stopUntil) { dx = 0; dy = 0; }
        else {
          dx = Math.cos(ang) * radial + Math.cos(ang + Math.PI / 2) * f.strafe;
          dy = Math.sin(ang) * radial + Math.sin(ang + Math.PI / 2) * f.strafe;
        }
      }
      if (outside) {
        dx += ((safe.x - f.x) / dSafe) * 1.5;
        dy += ((safe.y - f.y) / dSafe) * 1.5;
      }
    } else if (outside) {
      // Rotation: früh/spät je nach Bot, zu einem eigenen Punkt in der Zone (über Brücken, siehe unten)
      goal = this.rotPoint(f, safe);
      dx = goal.x - f.x;
      dy = goal.y - f.y;
    } else if (f.lastAttacker && f.lastAttacker.alive && now - f.lastHitAt < 2500 && now > f.retreatUntil) {
      dx = f.lastAttacker.x - f.x;
      dy = f.lastAttacker.y - f.y;
    } else if (f.pickLoot && !f.pickLoot.taken && Math.hypot(f.pickLoot.x - f.x, f.pickLoot.y - f.y) < PICKUP_R) {
      // stehen bleiben, bis der Gegenstand aufgehoben ist
      dx = 0; dy = 0;
    } else if (f.hp < 60 && this.nearestHeal(f)) {
      // nach dem Rückzug: Heilung holen
      const h = this.nearestHeal(f)!;
      goal = { x: h.x, y: h.y };
      dx = h.x - f.x; dy = h.y - f.y;
    } else if (now < f.revengeUntil && f.hp >= 70 && f.lastAttacker && f.lastAttacker.alive && Math.hypot(f.lastAttacker.x - f.x, f.lastAttacker.y - f.y) < 1000) {
      // geheilt: zurück zum Angreifer
      goal = { x: f.lastAttacker.x, y: f.lastAttacker.y };
      dx = goal.x - f.x; dy = goal.y - f.y;
    } else if (inHouse >= 0 && f.weapon.id !== 'fists' && ((f.persona === 'camper' && now < f.campUntil + 15000) || ((f.style === 'careful' || f.persona === 'camper') && this.heardFight(f, now)))) {
      // Haus verteidigen: innen an der Tür warten statt rauszulaufen
      const sp = this.holdSpot(f, inHouse);
      if (sp) {
        dx = sp.x - f.x; dy = sp.y - f.y;
        if (Math.hypot(dx, dy) < 16) { dx = 0; dy = 0; f.aim = rotateTo(f.aim, f.holdAim, 0.25); }
      }
    } else if (this.airdropGoal(f)) {
      // Versorgungspaket: hinlaufen, dort entstehen Kämpfe
      goal = this.airdropGoal(f)!;
      dx = goal.x - f.x; dy = goal.y - f.y;
      if (Math.hypot(dx, dy) < 50) { dx = 0; dy = 0; }
    } else if (this.thirdParty(f, now)) {
      // Dritt-Partei: zum Kampf, nah dran den schwächeren Beteiligten angreifen
      const h = this.thirdParty(f, now)!;
      const parts = [h.a, h.v].filter((x) => x.alive && x.phase === 'ground' && !this.ally(x, f));
      const weak = parts.sort((p, q) => (p.hp + p.armor) - (q.hp + q.armor))[0];
      if (weak && Math.hypot(weak.x - f.x, weak.y - f.y) < f.weapon.range && this.hasLOS(f.x, f.y, weak.x, weak.y)) {
        f.target = weak; f.targetSince = now - 300;
      }
      goal = { x: h.x, y: h.y };
      dx = h.x - f.x; dy = h.y - f.y;
    } else if (f.persona === 'rat' && alive > 5 && this.heardFight(f, now)) {
      // Ratte: weg von Kämpfen
      const h = this.heardFight(f, now)!;
      dx = f.x - h.x; dy = f.y - h.y;
    } else if (this.heardFight(f, now) && f.persona !== 'camper' && f.persona !== 'looter') {
      const h = this.heardFight(f, now)!;
      const bold = f.weapon.id !== 'fists' && f.hp > 60 && f.skill > 1.2;
      // Mutige laufen zum Kampf, Vorsichtige weichen aus
      dx = (h.x - f.x) * (bold ? 1 : -1);
      dy = (h.y - f.y) * (bold ? 1 : -1);
    } else {
      if (!f.lootTarget) {
        const l = this.findUsefulTarget(f, safe);
        if (l) {
          f.lootTarget = l;
          f.lootUntil = now + 7000;
        }
      }
      const geared = this.geared(f, now);
      // Camper: ausgerüstet ein Haus in der Zone suchen und halten
      if (f.persona === 'camper' && f.weapon.id !== 'fists' && (geared || !f.lootTarget) && inHouse < 0) {
        const hs = this.houses.map((h, i) => ({ h, i })).filter(({ h }) => (h.x - safe.x) ** 2 + (h.y - safe.y) ** 2 < (safe.r * 0.75) ** 2)
          .sort((p, q) => Math.hypot(p.h.x - f.x, p.h.y - f.y) - Math.hypot(q.h.x - f.x, q.h.y - f.y))[0];
        if (hs && Math.random() < 0.15 && Math.hypot(hs.h.x - f.x, hs.h.y - f.y) < 900) { f.campX = hs.h.x; f.campY = hs.h.y; f.campUntil = now + 2000; f.lootTarget = null; }
      }
      // Ratten (und vorsichtige Bots) verstecken sich in Büschen
      const hideChance = f.persona === 'rat' && alive > 5 ? 0.15 : f.style === 'careful' ? 0.06 : 0;
      if (!f.lootTarget && hideChance && now > f.campUntil + (f.persona === 'rat' ? 2000 : 8000) && Math.random() < hideChance) {
        const b = this.bushes.filter((b) => (b.x - safe.x) ** 2 + (b.y - safe.y) ** 2 < (safe.r * 0.8) ** 2)
          .sort((a, c) => ((a.x - f.x) ** 2 + (a.y - f.y) ** 2) - ((c.x - f.x) ** 2 + (c.y - f.y) ** 2))[0];
        if (b && Math.hypot(b.x - f.x, b.y - f.y) < 700) { f.campX = b.x; f.campY = b.y; f.campUntil = now + 9000 + Math.random() * 8000; }
      }
      // Jäger: ausgerüstet aktiv Gegner suchen (zuletzt gesehen oder der nächste in der Gegend)
      let hunt: { x: number; y: number } | null = null;
      if (f.persona === 'hunter' && weaponScore(f.weapon) >= 2 && f.hp > 50) {
        if (f.memory && now - f.memory.t < 6000) hunt = { x: f.memory.x, y: f.memory.y };
        else {
          let bd = 850;
          for (const o of this.fighters) {
            if (o === f || !o.alive || o.phase !== 'ground' || this.ally(o, f)) continue;
            const d = Math.hypot(o.x - f.x, o.y - f.y);
            if (d < bd) { bd = d; hunt = { x: o.x, y: o.y }; }
          }
        }
      }
      if (now < f.campUntil) {
        goal = { x: f.campX, y: f.campY };
        dx = f.campX - f.x;
        dy = f.campY - f.y;
        if (Math.hypot(dx, dy) < 14) { dx = 0; dy = 0; }
      } else if (this.followGap(f) > 340) {
        // beim Team bleiben
        const lead = this.teamLead(f)!;
        dx = lead.x - f.x;
        dy = lead.y - f.y;
      } else if (hunt && (geared || !f.lootTarget)) {
        goal = hunt;
        dx = hunt.x - f.x; dy = hunt.y - f.y;
      } else if (f.lootTarget) {
        dx = f.lootTarget.x - f.x;
        dy = f.lootTarget.y - f.y;
        goal = { x: f.lootTarget.x, y: f.lootTarget.y };
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
        goal = { x: f.wanderX, y: f.wanderY };
      }
    }

    let len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len; dy /= len;
      // liegt das Ziel auf der anderen Flussseite? Dann zuerst zur nächsten Brücke
      const gx = goal ? goal.x : f.x + dx * 500, gy = goal ? goal.y : f.y + dy * 500;
      // durch Türen in Häuser hinein/hinaus, sonst über Brücken
      const route = this.houseRoute(f, gx, gy) ?? this.bridgeRoute(f, gx, gy);
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

  /** zuletzt gehörter Kampf in der Nähe (nicht vom Bot selbst oder seinem Team) */
  private heardFight(f: Fighter, now: number) {
    for (let i = this.shotsHeard.length - 1; i >= 0; i--) {
      const h = this.shotsHeard[i];
      if (now - h.t > 3000) break;
      if (h.by === f || this.ally(h.by, f)) continue;
      const d = Math.hypot(h.x - f.x, h.y - f.y);
      if (d > 150 && d < 750) return h;
    }
    return null;
  }

  /** Wegpunkt durch die nächste Tür, wenn das Ziel in einem anderen Haus (oder draußen) liegt */
  private houseRoute(f: Fighter, tx: number, ty: number): { x: number; y: number } | null {
    const hf = this.houseAt(f.x, f.y), ht = this.houseAt(tx, ty);
    if (hf === ht) return null;
    const pickDoor = (hi: number, fromX: number, fromY: number) => {
      const h = this.houses[hi];
      return h.doors.slice().sort((a, b) => Math.hypot(a.x - fromX, a.y - fromY) - Math.hypot(b.x - fromX, b.y - fromY))[0];
    };
    if (hf >= 0) {
      // erst zur Tür hinaus
      const d = pickDoor(hf, tx, ty);
      if (!d) return null;
      const inside = { x: d.x - d.nx * 40, y: d.y - d.ny * 40 }, out = { x: d.x + d.nx * 70, y: d.y + d.ny * 70 };
      return Math.hypot(inside.x - f.x, inside.y - f.y) < 35 ? out : inside;
    }
    const d = pickDoor(ht, f.x, f.y);
    if (!d) return null;
    const out = { x: d.x + d.nx * 70, y: d.y + d.ny * 70 }, inside = { x: d.x - d.nx * 60, y: d.y - d.ny * 60 };
    // vor der Tür: hinein; sonst erst vor die Tür
    const nearDoor = Math.hypot(out.x - f.x, out.y - f.y) < 45 || Math.hypot(d.x - f.x, d.y - f.y) < 50;
    return nearDoor ? inside : out;
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
    if (k === 'ammo' || k === 'ammo6') return f.ammo < 90;
    if (k === 'armor') return f.armor < 100;
    // Heilung wird sofort verbraucht: nur nützlich, wenn Leben fehlt
    if (k === 'medkit') return f.hp < (f.isPlayer ? 100 : 85);
    if (k === 'bigmed') return f.hp < (f.isPlayer ? 100 : 60);
    return weaponScore(parseWeapon(k)) > weaponScore(f.weapon) + 0.01;
  }

  private hasNoWeapon(f: Fighter) {
    return f.weapon.id === 'fists';
  }

  private findUsefulTarget(f: Fighter, safe: Circle): Target | null {
    let best: Target | null = null;
    let bestD = (this.hasNoWeapon(f) ? 900 : 700) ** 2;
    const inSafe = (x: number, y: number) => (x - safe.x) ** 2 + (y - safe.y) ** 2 < safe.r * safe.r;
    const unarmed = this.hasNoWeapon(f);
    for (const l of this.loot) {
      if (l.taken || !this.isUseful(f, l.kind)) continue;
      // unbewaffnet: nur Waffen zählen, und die stark bevorzugt
      if (unarmed && !l.kind.startsWith('w:')) continue;
      const d = ((l.x - f.x) ** 2 + (l.y - f.y) ** 2) * (unarmed ? 0.25 : 1);
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
        if (!f.isPlayer) {
          if (!this.isUseful(f, l.kind)) continue;
          if (f.pickLoot !== l) { f.pickLoot = l; f.pickT = 0; }
          f.pickT += 100;
          if (f.pickT >= pickTime(l.kind) && this.tryPickup(f, l, false)) { f.pickLoot = null; break; }
          continue;
        }
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
      kinds = [wKind(w < 0.5 ? 'minigun' : 'rocket', Math.random() < 0.15 ? 5 : 4), 'armor', 'bigmed', 'ammo'];
    } else if (o.kind === 'chest') {
      kinds = [wKind(w < 0.28 ? 'smg' : w < 0.5 ? 'shotgun' : w < 0.85 ? 'rifle' : 'sniper', rollRarity(Math.random, CHEST_RARITY)), 'ammo', pickExtra()];
      if (Math.random() < 0.4) kinds.push(pickExtra());
    } else {
      kinds = [wKind(w < 0.32 ? 'smg' : w < 0.56 ? 'shotgun' : w < 0.9 ? 'rifle' : 'sniper', rollRarity(Math.random, CRATE_RARITY)), pickExtra()];
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
        // auch der Notfall-Platz bleibt im Haus und nie in der Kiste
        const h = this.houses[hi], m = h.s / 2 - 48;
        const fit = (q: { x: number; y: number }) => ({ x: clamp(q.x, h.x - m, h.x + m), y: clamp(q.y, h.y - m, h.y + m) });
        p = fit(p);
        if (insideChest(p.x, p.y)) {
          const ox = o.w / 2 + 50, oy = o.h / 2 + 50;
          const cands = [{ x: o.x, y: o.y + oy }, { x: o.x, y: o.y - oy }, { x: o.x + ox, y: o.y }, { x: o.x - ox, y: o.y }, { x: o.x + ox, y: o.y + oy }, { x: o.x - ox, y: o.y + oy }]
            .map(fit).filter((q) => !insideChest(q.x, q.y));
          if (cands.length) p = cands[i % cands.length];
        }
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
          if (!this.input.autoWeapon || !standing || l.kind === wKind(f.weapon.id, f.weapon.tier) || (f.backup && l.kind === wKind(f.backup.w.id, f.backup.w.tier))) continue;
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
    if (k === 'ammo' || k === 'ammo6') {
      if (f.ammo >= 150) return false;
      // 6er-Packung gibt doppelt so viel
      f.ammo = Math.min(k === 'ammo6' ? 220 : 180, f.ammo + (k === 'ammo6' ? 80 : 40));
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
      const w = parseWeapon(k);
      if (!manual && (f.isPlayer || weaponScore(w) <= weaponScore(f.weapon) + 0.01)) return false;
      const old = f.weapon;
      f.weapon = w;
      f.mag = w.mag;
      f.reloading = false;
      this.events.push({ type: 'weapon', f });
      if (old.id === 'fists') {
        // erste Waffe: Fäuste werden einfach ersetzt
      } else if (old.id !== 'pistol' || manual) {
        this.spawnLoot(l.x + 8, l.y + 8, wKind(old.id, old.tier));
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
    if (now < PLANE_TIME && this.player.phase === 'plane') return { text: `Wähle deinen Landepunkt · ${Math.ceil(this.dropLeft())}`, urgent: false };
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
