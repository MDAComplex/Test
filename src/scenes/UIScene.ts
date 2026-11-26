import Phaser from 'phaser';
import { WORLD, FIGHTER_COUNT } from '../config';
import { GameScene, GameResult, KillEvent, GRACE } from './GameScene';

const font = (size: number, color = '#ffffff') => ({
  fontFamily: 'Arial Black, Arial, sans-serif',
  fontSize: `${size}px`,
  color,
  stroke: '#000000',
  strokeThickness: 4,
});

interface Btn { c: Phaser.GameObjects.Container; circle: Phaser.GameObjects.Arc; top: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text }

export class UIScene extends Phaser.Scene {
  gs!: GameScene;
  aliveText!: Phaser.GameObjects.Text;
  killsText!: Phaser.GameObjects.Text;
  zoneText!: Phaser.GameObjects.Text;
  warnText!: Phaser.GameObjects.Text;
  weaponText!: Phaser.GameObjects.Text;
  ammoText!: Phaser.GameObjects.Text;
  hpText!: Phaser.GameObjects.Text;
  centerText!: Phaser.GameObjects.Text;
  toastText!: Phaser.GameObjects.Text;
  promptText!: Phaser.GameObjects.Text;
  hud!: Phaser.GameObjects.Graphics;
  mini!: Phaser.GameObjects.Graphics;
  joyG!: Phaser.GameObjects.Graphics;
  btnHeal!: Btn;
  btnReload!: Btn;
  btnPickup!: Btn;
  feed: { text: Phaser.GameObjects.Text; t: number }[] = [];
  joy = { active: false, id: -1, bx: 0, by: 0, x: 0, y: 0 };
  overlay: Phaser.GameObjects.Container | null = null;
  pendingResult: GameResult | null = null;
  miniSize = 150;
  miniX = 0;
  miniY = 0;
  barW = 280;
  barX = 0;
  toastTween: Phaser.Tweens.Tween | null = null;
  miniMaskG!: Phaser.GameObjects.Graphics;

  constructor() {
    super('UI');
  }

  create() {
    this.gs = this.scene.get('Game') as GameScene;
    this.feed = [];
    this.overlay = null;
    this.pendingResult = null;
    this.joy = { active: false, id: -1, bx: 0, by: 0, x: 0, y: 0 };
    this.input.addPointer(2);

    this.hud = this.add.graphics();
    this.mini = this.add.graphics();
    this.miniMaskG = this.make.graphics({ x: 0, y: 0 }, false);
    this.mini.setMask(this.miniMaskG.createGeometryMask());
    this.joyG = this.add.graphics();
    this.aliveText = this.add.text(0, 0, '', font(20));
    this.killsText = this.add.text(0, 0, '', font(16, '#ffd23f'));
    this.zoneText = this.add.text(0, 0, '', font(18)).setOrigin(0.5, 0);
    this.warnText = this.add.text(0, 0, 'Du bist außerhalb der Zone!', font(18, '#ff6b6b')).setOrigin(0.5, 0).setVisible(false);
    this.weaponText = this.add.text(0, 0, '', font(16)).setOrigin(0, 1);
    this.ammoText = this.add.text(0, 0, '', font(16)).setOrigin(1, 1);
    this.hpText = this.add.text(0, 0, '', font(13)).setOrigin(0.5);
    this.centerText = this.add.text(0, 0, '', font(40)).setOrigin(0.5);
    this.toastText = this.add.text(0, 0, '', font(22)).setOrigin(0.5).setAlpha(0);
    this.promptText = this.add.text(0, 0, '', font(16, '#ffffff')).setOrigin(0.5);

    this.btnHeal = this.makeButton('Heilen', 'H', 0x2e9e4f, () => (this.gs.ui.heal = true));
    this.btnReload = this.makeButton('Laden', 'R', 0xb07a1e, () => (this.gs.ui.reload = true));
    this.btnPickup = this.makeButton('Nehmen', 'E', 0x2f6fd0, () => (this.gs.ui.pickup = true));

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || this.overlay || this.joy.active) return;
      if (p.x > this.scale.width * 0.6) return;
      this.joy = { active: true, id: p.id, bx: p.x, by: p.y, x: 0, y: 0 };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.joy.active || p.id !== this.joy.id) return;
      let dx = p.x - this.joy.bx, dy = p.y - this.joy.by;
      const len = Math.hypot(dx, dy), max = 60;
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      this.joy.x = dx / max;
      this.joy.y = dy / max;
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id === this.joy.id) this.joy = { active: false, id: -1, bx: 0, by: 0, x: 0, y: 0 };
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    this.gs.events.on('kill', this.onKill, this);
    this.gs.events.on('toast', this.toast, this);
    this.gs.events.on('gameover', this.onGameOver, this);
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.gs.events.off('kill', this.onKill, this);
      this.gs.events.off('toast', this.toast, this);
      this.gs.events.off('gameover', this.onGameOver, this);
      this.scale.off('resize', this.layout, this);
    });
    this.layout();
  }

  makeButton(label: string, key: string, color: number, onPress: () => void): Btn {
    const c = this.add.container(0, 0);
    const circle = this.add.circle(0, 0, 36, color, 0.8).setStrokeStyle(3, 0xffffff, 0.9);
    const top = this.add.text(0, -6, label, font(13)).setOrigin(0.5);
    const sub = this.add.text(0, 14, key, font(12, '#e8e8e8')).setOrigin(0.5);
    c.add([circle, top, sub]);
    circle.setInteractive({ useHandCursor: true });
    circle.on('pointerdown', () => {
      onPress();
      c.setScale(0.9);
      this.time.delayedCall(90, () => c.setScale(1));
    });
    return { c, circle, top, sub };
  }

  layout() {
    const { width: w, height: h } = this.scale;
    const small = Math.min(w, h) < 600;
    this.miniSize = small ? 110 : 160;
    this.miniX = w - this.miniSize - 14;
    this.miniY = 14;
    this.miniMaskG.clear().fillStyle(0xffffff).fillRect(this.miniX - 3, this.miniY - 3, this.miniSize + 6, this.miniSize + 6);
    const narrow = w < 640;
    this.barW = narrow ? Math.max(120, w - 236) : 300;
    this.barX = narrow ? 16 : w / 2 - this.barW / 2;
    this.aliveText.setPosition(16, 14);
    this.killsText.setPosition(16, 42);
    // Auf schmalen Bildschirmen links unter den Zählern, sonst oben mittig
    const nz = w < 640;
    this.zoneText.setOrigin(nz ? 0 : 0.5, 0).setPosition(nz ? 16 : w / 2, nz ? 70 : 16);
    this.warnText.setOrigin(nz ? 0 : 0.5, 0).setPosition(nz ? 16 : w / 2, nz ? 96 : 44);
    this.centerText.setPosition(w / 2, h * 0.35);
    this.toastText.setPosition(w / 2, h * 0.25);
    this.promptText.setPosition(narrow ? this.barX + this.barW / 2 : w / 2, h - 118);
    const bx = w - 52, by = h - 58;
    this.btnHeal.c.setPosition(bx, by);
    this.btnReload.c.setPosition(bx - 84, by + 4);
    this.btnPickup.c.setPosition(bx - 26, by - 86);
    this.weaponText.setPosition(this.barX, h - 62);
    this.ammoText.setPosition(this.barX + this.barW, h - 62);
    this.hpText.setPosition(this.barX + this.barW / 2, h - 34);
    if (this.overlay && this.pendingResult) {
      this.overlay.destroy();
      this.overlay = null;
      this.showOverlay(this.pendingResult);
    }
    this.layoutFeed();
  }

  update() {
    const gs = this.gs;
    const p = gs.player;
    if (!p) return;
    const now = gs.time.now;
    gs.ui.joyX = this.joy.active ? this.joy.x : 0;
    gs.ui.joyY = this.joy.active ? this.joy.y : 0;

    this.aliveText.setText(`Übrig: ${gs.aliveCount()}`);
    this.killsText.setText(`Abschüsse: ${p.kills}`);
    const zi = gs.zoneInfo(now);
    this.zoneText.setText(zi.text).setColor(zi.urgent ? '#ffb74d' : '#ffffff');
    this.warnText.setVisible(gs.playerOutside() && Math.floor(now / 400) % 2 === 0);

    this.weaponText.setText(p.weapon.name);
    this.ammoText.setText(p.reloading ? 'Lädt…' : `${p.mag} / ${p.ammo}`).setColor(p.mag === 0 && p.ammo === 0 ? '#ff6b6b' : '#ffffff');
    this.hpText.setText(`${Math.ceil(Math.max(0, p.hp))}`);
    this.btnHeal.sub.setText(`H · ${p.medkits}`);
    this.btnHeal.c.setAlpha(p.medkits > 0 && p.hp < 100 ? 1 : 0.45);
    const nearby = gs.nearbyWeapon && !gs.over ? gs.nearbyWeapon : null;
    this.btnPickup.c.setVisible(!!nearby);
    this.promptText.setText(nearby ? `E / Nehmen: Waffe tauschen` : '');

    const grace = GRACE - (now - gs.startTime);
    if (grace > 0) this.centerText.setText(`Kampf beginnt in ${Math.ceil(grace / 1000)}`).setAlpha(1);
    else if (grace > -900) this.centerText.setText('LOS!').setAlpha(1 + grace / 900);
    else this.centerText.setText('');

    this.drawHud();
    this.drawMinimap();
    this.drawJoystick();

    const t = this.time.now;
    let changed = false;
    this.feed = this.feed.filter((e) => {
      if (t - e.t > 6000) {
        e.text.destroy();
        changed = true;
        return false;
      }
      return true;
    });
    if (changed) this.layoutFeed();
  }

  drawHud() {
    const h = this.scale.height;
    const p = this.gs.player;
    const g = this.hud;
    g.clear();
    const x = this.barX, y = h - 42, bw = this.barW;
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(x - 3, y - 3, bw + 6, 22, 6);
    const hp = Phaser.Math.Clamp(p.hp / 100, 0, 1);
    g.fillStyle(hp > 0.5 ? 0x4cd964 : hp > 0.25 ? 0xffcc00 : 0xff3b30);
    if (hp > 0) g.fillRoundedRect(x, y, bw * hp, 16, 4);
    g.fillStyle(0x000000, 0.55);
    g.fillRoundedRect(x - 3, y - 15, bw + 6, 11, 4);
    if (p.armor > 0) {
      g.fillStyle(0x4aa8ff);
      g.fillRoundedRect(x, y - 13, (bw * p.armor) / 100, 7, 3);
    }
  }

  drawMinimap() {
    const g = this.mini;
    const gs = this.gs;
    const S = this.miniSize, ox = this.miniX, oy = this.miniY, k = S / WORLD;
    g.clear();
    g.fillStyle(0x000000, 0.5);
    g.fillRect(ox - 3, oy - 3, S + 6, S + 6);
    g.fillStyle(0x4f8a3a, 0.95);
    g.fillRect(ox, oy, S, S);
    g.fillStyle(0x9a8c7a);
    for (const o of gs.map.obstacles) if (o.kind === 'wall') g.fillRect(ox + (o.x - o.w / 2) * k, oy + (o.y - o.h / 2) * k, Math.max(1, o.w * k), Math.max(1, o.h * k));
    const c = gs.zoneCur, n = gs.zoneNext;
    g.lineStyle(2, 0x7fb2ff, 1);
    g.strokeCircle(ox + c.x * k, oy + c.y * k, c.r * k);
    if (gs.zoneState !== 'done' && n.r > 0) {
      g.lineStyle(1.5, 0xffffff, 0.9);
      g.strokeCircle(ox + n.x * k, oy + n.y * k, n.r * k);
    }
    const p = gs.player;
    if (p.alive) {
      g.fillStyle(0xffd23f);
      g.fillCircle(ox + p.x * k, oy + p.y * k, 4);
      g.lineStyle(1.5, 0x000000);
      g.strokeCircle(ox + p.x * k, oy + p.y * k, 4);
    }
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokeRect(ox, oy, S, S);
  }

  drawJoystick() {
    const g = this.joyG;
    g.clear();
    if (!this.joy.active) return;
    const { bx, by, x, y } = this.joy;
    g.fillStyle(0xffffff, 0.15);
    g.fillCircle(bx, by, 60);
    g.lineStyle(3, 0xffffff, 0.5);
    g.strokeCircle(bx, by, 60);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(bx + x * 60, by + y * 60, 26);
  }

  onKill(e: KillEvent) {
    const color = e.me ? '#ff6b6b' : e.mine ? '#ffd23f' : '#ffffff';
    const txt = e.killer === 'Zone' ? `${e.victim} von der Zone erwischt` : `${e.killer} → ${e.victim}  (${e.weapon})`;
    const t = this.add.text(0, 0, txt, { ...font(13, color), strokeThickness: 3 }).setOrigin(1, 0);
    this.feed.push({ text: t, t: this.time.now });
    while (this.feed.length > 5) this.feed.shift()!.text.destroy();
    this.layoutFeed();
  }

  layoutFeed() {
    const x = this.scale.width - 14;
    let y = this.miniY + this.miniSize + 12;
    for (const e of this.feed) {
      e.text.setPosition(x, y);
      y += 19;
    }
  }

  toast(msg: string, color = '#ffffff') {
    this.toastText.setText(msg).setColor(color).setAlpha(1).setScale(1.15);
    this.toastTween?.stop();
    this.toastTween = this.tweens.add({ targets: this.toastText, scale: 1, alpha: 0, delay: 900, duration: 500 });
  }

  onGameOver(r: GameResult) {
    this.pendingResult = r;
    this.time.delayedCall(r.win ? 600 : 1200, () => this.showOverlay(r));
  }

  showOverlay(r: GameResult) {
    if (this.overlay) return;
    this.joy.active = false;
    const { width: w, height: h } = this.scale;
    const c = this.add.container(0, 0).setDepth(100);
    const bg = this.add.rectangle(0, 0, w, h, 0x05080a, 0.7).setOrigin(0).setInteractive();
    const title = this.add.text(w / 2, h * 0.28, r.win ? 'SIEG!' : `Platz #${r.place}`, font(r.win ? 64 : 54, r.win ? '#ffd23f' : '#ffffff')).setOrigin(0.5);
    const sub = this.add.text(w / 2, h * 0.28 + 58, r.win ? 'Du bist der letzte Überlebende' : `von ${FIGHTER_COUNT} Kämpfern`, font(18, '#d0d0d0')).setOrigin(0.5);
    const secs = Math.floor(r.time / 1000);
    const stats = this.add
      .text(w / 2, h * 0.28 + 100, `Abschüsse: ${r.kills}   •   Überlebt: ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, font(18))
      .setOrigin(0.5);
    const again = this.textButton(w / 2, h * 0.62, 'NOCHMAL', '#2e9e4f', () => {
      this.scene.stop('Game');
      this.scene.start('Drop');
    });
    const menu = this.textButton(w / 2, h * 0.62 + 70, 'MENÜ', '#3a4a5c', () => {
      this.scene.stop('Game');
      this.scene.start('Menu');
    });
    c.add([bg, title, sub, stats, again, menu]);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 300 });
    this.overlay = c;
  }

  textButton(x: number, y: number, label: string, bg: string, onClick: () => void) {
    const t = this.add
      .text(x, y, label, { ...font(24), backgroundColor: bg, padding: { x: 28, y: 10 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    t.on('pointerover', () => t.setScale(1.05));
    t.on('pointerout', () => t.setScale(1));
    t.on('pointerdown', onClick);
    return t;
  }
}
