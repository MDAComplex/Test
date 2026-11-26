import Phaser from 'phaser';
import { loadStats } from '../storage';
import { FIGHTER_COUNT } from '../config';

const font = (size: number, color = '#ffffff', stroke = 5) => ({
  fontFamily: 'Arial Black, Arial, sans-serif',
  fontSize: `${size}px`,
  color,
  stroke: '#000000',
  strokeThickness: stroke,
  align: 'center' as const,
});

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.draw();
    this.scale.on('resize', this.draw, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.draw, this));
    this.input.keyboard!.once('keydown-ENTER', () => this.scene.start('Drop'));
    this.input.keyboard!.once('keydown-SPACE', () => this.scene.start('Drop'));
  }

  draw() {
    this.children.removeAll(true);
    const { width: w, height: h } = this.scale;
    for (let x = 0; x < w; x += 256) for (let y = 0; y < h; y += 256) this.add.image(x, y, 'grass').setOrigin(0);
    this.add.rectangle(0, 0, w, h, 0x0b1a10, 0.55).setOrigin(0);

    // Deko-Kämpfer
    const deco = [0xffd23f, 0xe74c3c, 0x3498db, 0x9b59b6, 0x1abc9c];
    deco.forEach((c, i) => {
      const a = (i / deco.length) * Math.PI * 2;
      const img = this.add.image(w / 2 + Math.cos(a) * Math.min(w, h) * 0.42, h * 0.5 + Math.sin(a) * Math.min(w, h) * 0.38, 'fighter').setTint(c).setScale(1.6).setRotation(a + Math.PI);
      this.tweens.add({ targets: img, y: img.y - 10, duration: 900 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    });

    const s = Math.min(1, w / 520);
    this.add.text(w / 2, h * 0.24, 'ZONE RUSH', font(Math.round(72 * s), '#ffd23f', 8)).setOrigin(0.5);
    this.add.text(w / 2, h * 0.24 + 60 * s, `Battle Royale  •  ${FIGHTER_COUNT} Kämpfer  •  Nur einer überlebt`, font(Math.round(18 * s), '#ffffff', 4)).setOrigin(0.5);

    const btn = this.add
      .text(w / 2, h * 0.5, 'SPIELEN', { ...font(34), backgroundColor: '#2e9e4f', padding: { x: 44, y: 14 } })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: btn, scale: 1.06, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    btn.on('pointerdown', () => this.scene.start('Drop'));

    const st = loadStats();
    const statLine = st.games
      ? `Spiele: ${st.games}   •   Siege: ${st.wins}   •   Beste Platzierung: #${st.best}   •   Abschüsse: ${st.kills}`
      : 'Noch keine Runde gespielt';
    this.add.text(w / 2, h * 0.64, statLine, font(Math.round(15 * s), '#d8d8d8', 4)).setOrigin(0.5);

    const help = [
      'Laufen: WASD / Pfeiltasten  oder  Joystick (links tippen und ziehen)',
      'Schießen passiert automatisch, wenn ein Gegner in Reichweite ist',
      'H: Heilen   •   R: Nachladen   •   E: Waffe tauschen',
      'Bleib in der Zone, versteck dich in Büschen und sammle bessere Waffen!',
    ].join('\n');
    this.add.text(w / 2, h * 0.82, help, { ...font(Math.round(14 * s), '#ffffff', 3), lineSpacing: 6 }).setOrigin(0.5);
  }
}
