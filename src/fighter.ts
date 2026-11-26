import Phaser from 'phaser';
import { WEAPONS, WeaponDef } from './weapons';

export interface LootRef { x: number; y: number; taken: boolean }

export class Fighter {
  sprite!: Phaser.Physics.Arcade.Sprite;
  gun!: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text | null = null;
  name: string;
  isPlayer: boolean;
  color: number;

  hp = 100;
  armor = 0;
  medkits = 0;
  ammo = 45;
  weapon: WeaponDef = WEAPONS.pistol;
  mag = WEAPONS.pistol.mag;
  lastShot = -99999;
  reloading = false;
  reloadUntil = 0;
  healUntil = 0;
  aim = 0;
  aimError = 0;
  target: Fighter | null = null;
  targetSince = 0;
  nextScan = 0;
  alive = true;
  kills = 0;
  inBush = false;
  hidden = false;
  lastFiredAt = -99999;
  lastAttacker: Fighter | null = null;
  lastHitAt = -99999;

  // Bot-Steuerung
  moveX = 0;
  moveY = 0;
  nextThink = 0;
  wanderX = 0;
  wanderY = 0;
  wanderUntil = 0;
  strafe = 1;
  lastX = 0;
  lastY = 0;
  avoidUntil = 0;
  avoidAngle = 0;
  lootTarget: LootRef | null = null;
  lootUntil = 0;

  constructor(name: string, isPlayer: boolean, color: number) {
    this.name = name;
    this.isPlayer = isPlayer;
    this.color = color;
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
}
