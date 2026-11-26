import './style.css';
import { Game } from './sim/game';
import { Renderer } from './render/renderer';
import { Hud } from './ui/hud';
import { generateMap } from './mapgen';

const app = document.getElementById('app')!;
const renderer = new Renderer(app);
let game: Game | null = null;

const hud = new Hud({
  play: () => startRound(),
  menu: () => showMenu(),
});

function showMenu() {
  game = null;
  // Hintergrundkarte fürs Menü
  renderer.build(new Game(generateMap(Math.floor(Math.random() * 1e9))));
  hud.showMenu();
}

function startRound() {
  game = new Game(generateMap(Math.floor(Math.random() * 1e9)));
  renderer.build(game);
  hud.startRound(game);
}

window.addEventListener('resize', () => renderer.resize());

let last = performance.now();
function frame(now: number) {
  const dt = now - last;
  last = now;
  if (game) {
    hud.applyInput(game);
    game.update(dt);
    const events = game.events;
    game.events = [];
    renderer.handle(events);
    renderer.render(game, dt);
    hud.handle(events, game, renderer);
    hud.update(game, renderer);
  } else {
    renderer.renderMenu(dt);
  }
  requestAnimationFrame(frame);
}

showMenu();
requestAnimationFrame(frame);

// Für Tests/Debugging im Browser erreichbar
(window as unknown as { __zr: { game: () => Game | null } }).__zr = { game: () => game };
