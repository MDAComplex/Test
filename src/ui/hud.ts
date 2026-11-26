import { WORLD, FIGHTER_COUNT, PLANE_TIME } from '../config';
import { Game, Fighter, GameEvent, GameResult } from '../sim/game';
import { Renderer } from '../render/renderer';
import { loadStats } from '../storage';

const $ = <T extends HTMLElement>(html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as T;
};

export class Hud {
  private game: Game | null = null;
  private hud: HTMLElement;
  private labelsLayer: HTMLElement;
  private menu: HTMLElement;
  private over: HTMLElement;
  private e: Record<string, HTMLElement> = {};
  private mini: HTMLCanvasElement;
  private miniBase: HTMLCanvasElement | null = null;
  private labels = new Map<Fighter, { el: HTMLElement; hp: HTMLElement; ar: HTMLElement }>();
  private crateEl: HTMLElement;
  private joyEl: HTMLElement;
  private joy = { active: false, id: -1, bx: 0, by: 0, x: 0, y: 0 };
  private keys = new Set<string>();
  private pending = { jump: false, heal: false, reload: false, pickup: false };
  private feed: { el: HTMLElement; t: number }[] = [];
  private lastMini = 0;

  constructor(private cb: { play: () => void; menu: () => void }) {
    this.labelsLayer = $('<div id="labels"></div>');
    this.hud = $(`
      <div id="hud" class="hidden">
        <div class="tl"><div class="alive"></div><div class="kills"></div></div>
        <div class="zone"></div>
        <div class="warn hidden">Du bist außerhalb der Zone!</div>
        <canvas class="mini" width="320" height="320"></canvas>
        <div class="feed"></div>
        <div class="center"></div>
        <div class="toast"></div>
        <div class="prompt"></div>
        <div class="bottom">
          <div class="wrow"><span class="wname"></span><span class="ammo"></span></div>
          <div class="bar ar"><i></i></div>
          <div class="bar hp"><i></i><span></span></div>
        </div>
        <div class="buttons">
          <button class="rb jump">SPRINGEN<small>Leertaste</small></button>
          <button class="rb heal">Heilen<small>H</small></button>
          <button class="rb reload">Laden<small>R</small></button>
          <button class="rb pick">Nehmen<small>E</small></button>
        </div>
        <div class="joy hidden"><i></i></div>
      </div>`);
    this.menu = $(`
      <div class="screen" id="menu">
        <div class="title">ZONE RUSH</div>
        <div class="subtitle">3D Battle Royale  •  ${FIGHTER_COUNT} Kämpfer  •  Nur einer überlebt</div>
        <button class="btn pulse play">SPIELEN</button>
        <div class="stats"></div>
        <div class="help">
          Spring aus dem Flugzeug und lenk deinen Fallschirm<br>
          Laufen: WASD / Pfeiltasten oder Joystick (links auf dem Bildschirm ziehen)<br>
          Schießen passiert automatisch, sobald ein Gegner in Reichweite ist<br>
          Stell dich neben eine Kiste, um sie zu öffnen  •  H: Heilen  •  R: Nachladen  •  E: Waffe tauschen
        </div>
        <div class="hint portrait hidden">Tipp: Halte dein Handy quer, dann siehst du mehr vom Spielfeld</div>
      </div>`);
    this.over = $(`
      <div class="screen hidden" id="over">
        <div class="big"></div>
        <div class="subtitle osub"></div>
        <div class="subtitle ostats"></div>
        <button class="btn again">NOCHMAL</button>
        <button class="btn secondary tomenu">MENÜ</button>
      </div>`);
    document.body.append(this.labelsLayer, this.hud, this.menu, this.over);

    for (const k of ['alive', 'kills', 'zone', 'warn', 'feed', 'center', 'toast', 'prompt', 'wname', 'ammo', 'jump', 'heal', 'reload', 'pick']) {
      this.e[k] = this.hud.querySelector('.' + k)!;
    }
    this.e.arBar = this.hud.querySelector('.bar.ar i')!;
    this.e.hpBar = this.hud.querySelector('.bar.hp i')!;
    this.e.hpText = this.hud.querySelector('.bar.hp span')!;
    this.mini = this.hud.querySelector('.mini')!;
    this.joyEl = this.hud.querySelector('.joy')!;
    this.crateEl = $('<div class="crate hidden"><i></i></div>');
    this.labelsLayer.append(this.crateEl);

    this.menu.querySelector('.play')!.addEventListener('click', () => this.cb.play());
    this.over.querySelector('.again')!.addEventListener('click', () => this.cb.play());
    this.over.querySelector('.tomenu')!.addEventListener('click', () => this.cb.menu());
    const press = (el: HTMLElement, key: keyof Hud['pending']) =>
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        this.pending[key] = true;
      });
    press(this.e.jump, 'jump');
    press(this.e.heal, 'heal');
    press(this.e.reload, 'reload');
    press(this.e.pick, 'pickup');

    window.addEventListener('keydown', (ev) => {
      this.keys.add(ev.code);
      if (ev.repeat) return;
      if (ev.code === 'Space') { this.pending.jump = true; ev.preventDefault(); }
      if (ev.code === 'KeyH') this.pending.heal = true;
      if (ev.code === 'KeyR') this.pending.reload = true;
      if (ev.code === 'KeyE') this.pending.pickup = true;
      if (ev.code === 'Enter' && !this.menu.classList.contains('hidden')) this.cb.play();
    });
    window.addEventListener('keyup', (ev) => this.keys.delete(ev.code));
    window.addEventListener('blur', () => this.keys.clear());

    // Joystick: linke 60 % des Bildschirms
    window.addEventListener('pointerdown', (ev) => {
      if (!this.game || this.joy.active || ev.clientX > window.innerWidth * 0.6) return;
      if ((ev.target as HTMLElement).closest('button, .screen')) return;
      this.joy = { active: true, id: ev.pointerId, bx: ev.clientX, by: ev.clientY, x: 0, y: 0 };
      this.joyEl.classList.remove('hidden');
      this.joyEl.style.left = ev.clientX + 'px';
      this.joyEl.style.top = ev.clientY + 'px';
      this.moveKnob();
    });
    window.addEventListener('pointermove', (ev) => {
      if (!this.joy.active || ev.pointerId !== this.joy.id) return;
      let dx = ev.clientX - this.joy.bx, dy = ev.clientY - this.joy.by;
      const len = Math.hypot(dx, dy), max = 55;
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      this.joy.x = dx / max;
      this.joy.y = dy / max;
      this.moveKnob();
    });
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== this.joy.id) return;
      this.joy = { active: false, id: -1, bx: 0, by: 0, x: 0, y: 0 };
      this.joyEl.classList.add('hidden');
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  private moveKnob() {
    (this.joyEl.firstElementChild as HTMLElement).style.transform = `translate(${this.joy.x * 55}px, ${this.joy.y * 55}px)`;
  }

  showMenu() {
    this.game = null;
    this.hud.classList.add('hidden');
    this.over.classList.add('hidden');
    this.menu.classList.remove('hidden');
    this.clearLabels();
    const st = loadStats();
    this.menu.querySelector('.stats')!.textContent = st.games
      ? `Spiele: ${st.games}  •  Siege: ${st.wins}  •  Beste Platzierung: #${st.best}  •  Abschüsse: ${st.kills}`
      : 'Noch keine Runde gespielt';
    this.menu.querySelector('.portrait')!.classList.toggle('hidden', window.innerWidth > window.innerHeight);
  }

  startRound(game: Game) {
    this.game = game;
    this.menu.classList.add('hidden');
    this.over.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.clearLabels();
    this.feed.forEach((f) => f.el.remove());
    this.feed = [];
    this.buildMiniBase(game);
    for (const f of game.fighters) {
      if (f.isPlayer) continue;
      const el = $(`<div class="lbl"><div class="n"></div><div class="b a"><i></i></div><div class="b"><i></i></div></div>`);
      el.querySelector('.n')!.textContent = f.name;
      const [ar, hp] = Array.from(el.querySelectorAll('.b i')) as HTMLElement[];
      this.labelsLayer.append(el);
      this.labels.set(f, { el, hp, ar });
    }
  }

  private clearLabels() {
    this.labels.forEach((l) => l.el.remove());
    this.labels.clear();
    this.crateEl.classList.add('hidden');
  }

  /** Tastatur/Joystick in die Spieleingabe übertragen */
  applyInput(game: Game) {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    if (this.joy.active) { mx += this.joy.x; my += this.joy.y; }
    game.input.mx = mx;
    game.input.my = my;
    if (this.pending.jump) game.input.jump = true;
    if (this.pending.heal) game.input.heal = true;
    if (this.pending.reload) game.input.reload = true;
    if (this.pending.pickup) game.input.pickup = true;
    this.pending = { jump: false, heal: false, reload: false, pickup: false };
  }

  handle(events: GameEvent[], game: Game, r: Renderer) {
    for (const ev of events) {
      if (ev.type === 'kill') {
        const color = ev.me ? '#ff6b6b' : ev.mine ? '#ffd23f' : '#ffffff';
        const txt = ev.killer === 'Zone' ? `${ev.victim} von der Zone erwischt` : `${ev.killer} → ${ev.victim} (${ev.weapon})`;
        const el = document.createElement('div');
        el.textContent = txt;
        el.style.color = color;
        this.e.feed.append(el);
        this.feed.push({ el, t: performance.now() });
        while (this.feed.length > 5) this.feed.shift()!.el.remove();
      } else if (ev.type === 'toast') {
        this.toast(ev.text, ev.color);
      } else if (ev.type === 'damage' && (ev.byPlayer || ev.toPlayer) && ev.amount > 0) {
        const p = r.project(ev.f.x, ev.f.y, 2.6);
        if (!p.on) continue;
        const el = document.createElement('div');
        el.className = 'dmg';
        el.textContent = ev.toPlayer ? `-${ev.amount}` : String(ev.amount);
        el.style.color = ev.toPlayer ? '#ff5a5a' : '#ffffff';
        el.style.transform = `translate(${p.x + (Math.random() - 0.5) * 20}px, ${p.y}px)`;
        this.labelsLayer.append(el);
        setTimeout(() => el.remove(), 750);
      } else if (ev.type === 'heal' && ev.f === game.player) {
        this.toast('+50 Leben', '#5dff7a');
      } else if (ev.type === 'gameover') {
        setTimeout(() => this.showOver(ev.result), ev.result.win ? 700 : 1400);
      }
    }
  }

  private toast(text: string, color: string) {
    const t = this.e.toast;
    t.textContent = text;
    t.style.color = color;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  private showOver(r: GameResult) {
    if (!this.game) return;
    const big = this.over.querySelector('.big') as HTMLElement;
    big.textContent = r.win ? 'SIEG!' : `Platz #${r.place}`;
    big.classList.toggle('win', r.win);
    this.over.querySelector('.osub')!.textContent = r.win ? 'Du bist der letzte Überlebende' : `von ${FIGHTER_COUNT} Kämpfern`;
    const s = Math.floor(r.time / 1000);
    this.over.querySelector('.ostats')!.textContent = `Abschüsse: ${r.kills}   •   Überlebt: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.over.classList.remove('hidden');
  }

  update(game: Game, r: Renderer) {
    const p = game.player;
    this.e.alive.textContent = `Übrig: ${game.aliveCount()}`;
    this.e.kills.textContent = `Abschüsse: ${p.kills}`;
    const zi = game.zoneInfo();
    this.e.zone.textContent = zi.text;
    this.e.zone.classList.toggle('urgent', zi.urgent);
    this.e.warn.classList.toggle('hidden', !game.playerOutside());
    this.e.wname.textContent = p.weapon.name;
    this.e.ammo.textContent = p.reloading ? 'Lädt…' : `${p.mag} / ${p.ammo}`;
    this.e.hpBar.style.width = `${Math.max(0, p.hp)}%`;
    this.e.hpBar.style.background = p.hp > 50 ? 'var(--hp)' : p.hp > 25 ? '#ffcc00' : '#ff3b30';
    this.e.hpText.textContent = String(Math.ceil(Math.max(0, p.hp)));
    this.e.arBar.style.width = `${p.armor}%`;

    const inPlane = p.phase === 'plane';
    const ground = p.phase === 'ground' && p.alive && !game.over;
    this.e.jump.classList.toggle('hidden', !inPlane);
    this.e.heal.classList.toggle('hidden', !ground);
    this.e.reload.classList.toggle('hidden', !ground);
    this.e.heal.innerHTML = `Heilen<small>H · ${p.medkits}</small>`;
    this.e.heal.classList.toggle('dim', p.medkits === 0 || p.hp >= 100);
    const nearby = ground && game.nearbyWeapon ? game.nearbyWeapon : null;
    this.e.pick.classList.toggle('hidden', !nearby);
    this.e.prompt.textContent = nearby ? 'E / Nehmen: Waffe tauschen' : p.phase === 'fall' ? 'Lenk deinen Fallschirm zum Landeplatz' : '';

    if (inPlane) {
      const left = Math.ceil((PLANE_TIME - game.time) / 1000);
      this.e.center.textContent = left <= 5 ? `Automatischer Absprung in ${left}` : '';
    } else {
      this.e.center.textContent = '';
    }

    // Namensschilder
    for (const [f, l] of this.labels) {
      if (!f.alive || f.phase !== 'ground' || !r.fighterVisible(f)) {
        l.el.style.display = 'none';
        continue;
      }
      const s = r.project(f.x, f.y, 2.85);
      if (!s.on) {
        l.el.style.display = 'none';
        continue;
      }
      l.el.style.display = '';
      l.el.style.transform = `translate(${s.x}px, ${s.y - 34}px)`;
      l.hp.style.width = `${Math.max(0, f.hp)}%`;
      l.hp.style.background = f.hp > 50 ? 'var(--hp)' : f.hp > 25 ? '#ffcc00' : '#ff3b30';
      l.ar.parentElement!.style.visibility = f.armor > 0 ? 'visible' : 'hidden';
      l.ar.style.width = `${f.armor}%`;
    }

    // Fortschritt beim Kistenöffnen
    let crate = null as null | { x: number; y: number; progress: number };
    if (ground) {
      for (const o of game.obstacles) {
        if (o.kind !== 'crate' || o.opened || o.progress <= 0) continue;
        if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 < 110 * 110) crate = o;
      }
    }
    if (crate) {
      const s = r.project(crate.x, crate.y, 2.6);
      this.crateEl.classList.remove('hidden');
      this.crateEl.style.transform = `translate(${s.x}px, ${s.y}px)`;
      (this.crateEl.firstElementChild as HTMLElement).style.width = `${Math.min(100, crate.progress * 100)}%`;
    } else {
      this.crateEl.classList.add('hidden');
    }

    const now = performance.now();
    this.feed = this.feed.filter((f) => {
      if (now - f.t > 6000) {
        f.el.remove();
        return false;
      }
      return true;
    });

    if (now - this.lastMini > 100) {
      this.lastMini = now;
      this.drawMini(game);
    }
  }

  private buildMiniBase(game: Game) {
    const c = document.createElement('canvas');
    c.width = c.height = 320;
    const g = c.getContext('2d')!;
    const k = 320 / WORLD;
    g.fillStyle = '#3aa6dc';
    g.fillRect(0, 0, 320, 320);
    g.fillStyle = '#ecd59a';
    g.fillRect(0, 0, 320, 320);
    g.fillStyle = '#86c95a';
    g.beginPath();
    g.roundRect(7, 7, 306, 306, 16);
    g.fill();
    for (const o of game.map.obstacles) {
      if (o.kind === 'tree') { g.fillStyle = '#4ea845'; g.beginPath(); g.arc(o.x * k, o.y * k, 3.5, 0, 7); g.fill(); }
      else if (o.kind === 'rock') { g.fillStyle = '#8e939b'; g.beginPath(); g.arc(o.x * k, o.y * k, Math.max(2, o.r * k), 0, 7); g.fill(); }
    }
    for (const h of game.houses) {
      g.fillStyle = '#c0573e';
      g.fillRect((h.x - h.s / 2) * k, (h.y - h.s / 2) * k, h.s * k, h.s * k);
    }
    this.miniBase = c;
  }

  private drawMini(game: Game) {
    const g = this.mini.getContext('2d')!;
    const k = 320 / WORLD;
    if (this.miniBase) g.drawImage(this.miniBase, 0, 0);
    g.fillStyle = '#ffd54a';
    for (const o of game.obstacles) if (o.kind === 'crate' && !o.opened) g.fillRect(o.x * k - 2, o.y * k - 2, 4, 4);
    if (game.time < PLANE_TIME * 1.1) {
      const pl = game.plane;
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.setLineDash([8, 6]);
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(pl.x1 * k, pl.y1 * k); g.lineTo(pl.x2 * k, pl.y2 * k); g.stroke();
      g.setLineDash([]);
    }
    const zc = game.zoneCur, zn = game.zoneNext;
    g.save();
    g.beginPath();
    g.rect(0, 0, 320, 320);
    g.arc(zc.x * k, zc.y * k, Math.max(0, zc.r * k), 0, Math.PI * 2, true);
    g.fillStyle = 'rgba(40,72,200,0.35)';
    g.fill('evenodd');
    g.restore();
    g.strokeStyle = '#7fb2ff'; g.lineWidth = 3;
    g.beginPath(); g.arc(zc.x * k, zc.y * k, Math.max(0, zc.r * k), 0, 7); g.stroke();
    if (game.zoneState !== 'done' && zn.r > 0) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.beginPath(); g.arc(zn.x * k, zn.y * k, zn.r * k, 0, 7); g.stroke();
    }
    const p = game.player;
    if (p.alive) {
      const px = (p.phase === 'plane' ? game.planePos().x : p.x) * k, py = (p.phase === 'plane' ? game.planePos().y : p.y) * k;
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.arc(px, py, 6, 0, 7); g.fill(); g.stroke();
    }
  }
}
