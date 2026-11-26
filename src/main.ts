import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { DropScene } from './scenes/DropScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#16261a',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  physics: { default: 'arcade', arcade: { debug: false } },
  input: { activePointers: 3 },
  scene: [BootScene, MenuScene, DropScene, GameScene, UIScene],
});

// Für Tests/Debugging im Browser erreichbar
(window as unknown as { __game: Phaser.Game }).__game = game;
