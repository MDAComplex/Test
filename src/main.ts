import './style.css';
import { Game } from './sim/game';
import { Renderer } from './render/renderer';
import { Hud } from './ui/hud';
import { generateMap } from './mapgen';
import { loadPlush } from './render/plush';

const app = document.getElementById('app')!;
const renderer = new Renderer(app);
let game: Game | null = null;

const hud = new Hud({
  play: () => startRound(),
  menu: () => showMenu(),
  settingsChanged: (s) => renderer.setQuality(s.quality),
});

function showMenu() {
  game = null;
  renderer.build(new Game(generateMap(Math.floor(Math.random() * 1e9))));
  hud.showMenu();
}

function startRound() {
  game = new Game(generateMap(Math.floor(Math.random() * 1e9)), hud.playerColor, hud.settings.mode, hud.playerLook);
  // Tageszeit zufällig: Mittag, Abendrot oder Morgen
  renderer.build(game, Math.floor(Math.random() * 3));
  fps.samples = [];
  renderer.resetShadowArea();
  hud.startRound(game);
}

window.addEventListener('resize', () => renderer.resize());

let last = performance.now();
// automatische Grafik: bei dauerhaft niedriger Bildrate Schatten und Auflösung reduzieren
const fps = { samples: [] as number[], lowered: false };
function autoQuality(dt: number) {
  if (fps.lowered || hud.settings.quality !== 'auto' || !game || game.player.phase === 'plane') return;
  fps.samples.push(dt);
  if (fps.samples.length < 180) return;
  const avg = fps.samples.reduce((a, b) => a + b, 0) / fps.samples.length;
  fps.samples = [];
  if (avg > 1000 / 38) {
    fps.lowered = true;
    renderer.setQuality('low');
    hud.notice('Grafik automatisch reduziert, damit es flüssiger läuft');
  }
}
function frame(now: number) {
  const dt = now - last;
  last = now;
  if (game) {
    // Siegesbildschirm: Spiel bleibt stehen, im Hintergrund sieht man die angehaltene Szene
    const stop = hud.paused || hud.blocked() || hud.frozen;
    if (!stop) {
      hud.applyInput(game, renderer);
      game.update(dt);
      autoQuality(dt);
    }
    const events = game.events;
    game.events = [];
    renderer.fpp.on = hud.fppOn();
    renderer.fpp.yaw = hud.fppYaw;
    renderer.fpp.pitch = hud.fppPitch;
    renderer.handle(events, game);
    renderer.render(game, stop ? 0 : dt);
    hud.handle(events, game, renderer);
    hud.update(game, renderer);
  } else {
    renderer.renderMenu(dt);
  }
  requestAnimationFrame(frame);
}

showMenu();
requestAnimationFrame(frame);
// Plüsch-Figuren im Hintergrund laden, danach Vorschau und Profilbild aktualisieren
loadPlush().then(() => hud.refreshLook());

// Für Tests/Debugging im Browser erreichbar
(window as unknown as { __zr: object }).__zr = { game: () => game, renderer };
