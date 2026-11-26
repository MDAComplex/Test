import { WORLD, FIGHTER_COUNT, PLANE_TIME } from '../config';
import { Game, Fighter, GameEvent, GameResult, lootLabel, isContainer } from '../sim/game';
import { Renderer } from '../render/renderer';
import { loadStats } from '../storage';
import { Settings, loadSettings, saveSettings } from '../settings';
import { Sfx } from '../sfx';
import { WEAPONS, TIER_COLORS, WeaponId } from '../weapons';

const $ = <T extends HTMLElement>(html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as T;
};
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

interface Stick { active: boolean; id: number; bx: number; by: number; x: number; y: number; el: HTMLElement }

const RING_C = 2 * Math.PI * 26;

export class Hud {
  settings: Settings = loadSettings();
  sfx = new Sfx();
  paused = false;
  private game: Game | null = null;
  private hud: HTMLElement;
  private labelsLayer: HTMLElement;
  private menu: HTMLElement;
  private over: HTMLElement;
  private settingsEl: HTMLElement;
  private e: Record<string, HTMLElement> = {};
  private mini: HTMLCanvasElement;
  private miniBase: HTMLCanvasElement | null = null;
  private labels = new Map<Fighter, { el: HTMLElement; hp: HTMLElement; ar: HTMLElement }>();
  private ring: HTMLElement;
  private ringArc: SVGCircleElement;
  private move: Stick;
  private aim: Stick;
  private keys = new Set<string>();
  private pending = { jump: false, heal: false, reload: false, pickup: false };
  private feed: { el: HTMLElement; t: number }[] = [];
  private lastMini = 0;
  private mouse = { on: false, x: 0, y: 0, down: false };
  /** zuletzt per Touch bedient (Handy/Tablet) */
  private touch = window.matchMedia('(hover: none)').matches;

  constructor(private cb: { play: () => void; menu: () => void; settingsChanged: (s: Settings) => void }) {
    this.labelsLayer = $('<div id="labels"></div>');
    this.hud = $(`
      <div id="hud" class="hidden">
        <button class="gear" aria-label="Einstellungen"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg></button>
        <div class="zone"></div>
        <div class="warn hidden">Du bist außerhalb der Zone!</div>
        <canvas class="mini" width="320" height="320"></canvas>
        <div class="mstats">
          <span class="ms" title="Noch am Leben"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="7" r="4.2" fill="currentColor"/><path d="M3.5 21c0-4.8 3.8-8 8.5-8s8.5 3.2 8.5 8z" fill="currentColor"/></svg><b class="alive"></b></span>
          <span class="ms" title="Deine Abschüsse"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg><b class="kills"></b></span>
        </div>
        <div class="feed"></div>
        <div class="center"></div>
        <div class="toast"></div>
        <div class="prompt"></div>
        <button class="pickcard hidden"><span class="pc-icon"></span><span class="pc-text"><b class="pc-name"></b><small class="pc-stats"></small></span><span class="pc-key">E</span></button>
        <div class="bottom">
          <div class="wrow"><span class="wname"></span><span class="ammo"></span></div>
          <div class="bar ar"><i></i></div>
          <div class="bar hp"><i></i><span></span></div>
        </div>
        <div class="buttons">
          <button class="rb reload">Laden<small>R</small></button>
        </div>
        <button class="rb jump hidden">SPRINGEN<small>Leertaste</small></button>
        <div class="joy move hidden"><i></i></div>
        <div class="joy aim hidden"><i></i></div>
      </div>`);
    this.menu = $(`
      <div class="screen" id="menu">
        <div class="title">ZONE RUSH</div>
        <div class="subtitle">3D Battle Royale  •  ${FIGHTER_COUNT} Kämpfer  •  Nur einer überlebt</div>
        <button class="btn pulse play">SPIELEN</button>
        <button class="btn secondary opensettings">EINSTELLUNGEN</button>
        <div class="stats"></div>
        <div class="help">
          <b>PC:</b> WASD laufen  •  Maus zielen  •  Linksklick schießen  •  E Waffe aufheben  •  R nachladen<br>
          <b>Handy:</b> linker Stick laufen  •  rechter Stick zielen und schießen (in den Einstellungen tauschbar)<br>
          Spring aus dem Flugzeug, öffne Kisten, Truhen und Versorgungspakete und bleib in der Zone
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
    this.settingsEl = $(`
      <div class="screen hidden" id="settings">
        <div class="panel">
          <h2>Einstellungen</h2>
          <div class="row"><span>Steuerung am Handy</span><div class="seg" data-key="swap">
            <button data-v="false">Links laufen · Rechts zielen</button><button data-v="true">Links zielen · Rechts laufen</button></div></div>
          <div class="row"><span>Zielhilfe am Handy</span><div class="seg" data-key="assist"><button data-v="true">An</button><button data-v="false">Aus</button></div></div>
          <div class="row"><span>Grafik</span><div class="seg" data-key="quality"><button data-v="high">Hoch</button><button data-v="low">Niedrig (flüssiger)</button></div></div>
          <div class="row"><span>Ton</span><div class="seg" data-key="sound"><button data-v="true">An</button><button data-v="false">Aus</button></div></div>
          <div class="actions">
            <button class="btn resume">WEITER</button>
            <button class="btn secondary leave">RUNDE VERLASSEN</button>
          </div>
        </div>
      </div>`);
    this.ring = $(`<div class="pring hidden"><svg viewBox="0 0 60 60" width="60" height="60"><circle cx="30" cy="30" r="26" class="bg"/><circle cx="30" cy="30" r="26" class="fg"/></svg></div>`);
    document.body.append(this.labelsLayer, this.hud, this.menu, this.over, this.settingsEl);
    this.labelsLayer.append(this.ring);
    this.ringArc = this.ring.querySelector('.fg') as SVGCircleElement;
    this.ringArc.style.strokeDasharray = String(RING_C);

    for (const k of ['alive', 'kills', 'zone', 'warn', 'feed', 'center', 'toast', 'prompt', 'wname', 'ammo', 'jump', 'reload', 'pickcard', 'buttons', 'gear']) {
      this.e[k] = this.hud.querySelector('.' + k)!;
    }
    this.e.arBar = this.hud.querySelector('.bar.ar i')!;
    this.e.hpBar = this.hud.querySelector('.bar.hp i')!;
    this.e.hpText = this.hud.querySelector('.bar.hp span')!;
    this.e.pcIcon = this.hud.querySelector('.pc-icon')!;
    this.e.pcName = this.hud.querySelector('.pc-name')!;
    this.e.pcStats = this.hud.querySelector('.pc-stats')!;
    this.mini = this.hud.querySelector('.mini')!;
    this.move = { active: false, id: -1, bx: 0, by: 0, x: 0, y: 0, el: this.hud.querySelector('.joy.move')! };
    this.aim = { active: false, id: -1, bx: 0, by: 0, x: 0, y: 0, el: this.hud.querySelector('.joy.aim')! };

    const startAudio = () => this.sfx.unlock();
    this.menu.querySelector('.play')!.addEventListener('click', () => { startAudio(); this.cb.play(); });
    this.menu.querySelector('.opensettings')!.addEventListener('click', () => this.openSettings(false));
    this.over.querySelector('.again')!.addEventListener('click', () => { startAudio(); this.cb.play(); });
    this.over.querySelector('.tomenu')!.addEventListener('click', () => this.cb.menu());
    this.e.gear.addEventListener('click', () => this.openSettings(true));
    this.settingsEl.querySelector('.resume')!.addEventListener('click', () => this.closeSettings());
    this.settingsEl.querySelector('.leave')!.addEventListener('click', () => { this.closeSettings(); this.cb.menu(); });
    this.settingsEl.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
      seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => {
          const key = seg.dataset.key as keyof Settings;
          const raw = b.dataset.v!;
          const val = raw === 'true' ? true : raw === 'false' ? false : raw;
          (this.settings as unknown as Record<string, unknown>)[key] = val;
          saveSettings(this.settings);
          this.applySettings();
        }),
      );
    });
    this.applySettings();

    const press = (el: HTMLElement, key: keyof Hud['pending']) =>
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation();
        this.pending[key] = true;
      });
    press(this.e.jump, 'jump');
    press(this.e.reload, 'reload');
    press(this.e.pickcard, 'pickup');

    window.addEventListener('keydown', (ev) => {
      this.keys.add(ev.code);
      if (ev.repeat) return;
      if (ev.code === 'Space') { this.pending.jump = true; ev.preventDefault(); }
      if (ev.code === 'KeyR') this.pending.reload = true;
      if (ev.code === 'KeyE') this.pending.pickup = true;
      if (ev.code === 'Escape' && this.game) this.paused ? this.closeSettings() : this.openSettings(true);
      if (ev.code === 'Enter' && !this.menu.classList.contains('hidden')) { startAudio(); this.cb.play(); }
    });
    window.addEventListener('keyup', (ev) => this.keys.delete(ev.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });

    window.addEventListener('pointerdown', (ev) => {
      if (!this.game || this.paused) return;
      if ((ev.target as HTMLElement).closest('button, .screen')) return;
      this.touch = ev.pointerType !== 'mouse';
      if (ev.pointerType === 'mouse') {
        this.mouse.on = true;
        this.mouse.x = ev.clientX;
        this.mouse.y = ev.clientY;
        if (ev.button === 0) this.mouse.down = true;
        return;
      }
      this.mouse.on = false;
      const leftHalf = ev.clientX < window.innerWidth / 2;
      const moveLeft = !this.settings.swap;
      const stick = leftHalf === moveLeft ? this.move : this.aim;
      if (stick.active) return;
      Object.assign(stick, { active: true, id: ev.pointerId, bx: ev.clientX, by: ev.clientY, x: 0, y: 0 });
      stick.el.classList.remove('hidden');
      stick.el.style.left = ev.clientX + 'px';
      stick.el.style.top = ev.clientY + 'px';
      this.knob(stick);
    });
    window.addEventListener('pointermove', (ev) => {
      if (ev.pointerType === 'mouse') {
        this.mouse.x = ev.clientX;
        this.mouse.y = ev.clientY;
        if (this.game) this.mouse.on = true;
        return;
      }
      for (const s of [this.move, this.aim]) {
        if (!s.active || ev.pointerId !== s.id) continue;
        let dx = ev.clientX - s.bx, dy = ev.clientY - s.by;
        const len = Math.hypot(dx, dy), max = 55;
        if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
        s.x = dx / max;
        s.y = dy / max;
        this.knob(s);
      }
    });
    const up = (ev: PointerEvent) => {
      if (ev.pointerType === 'mouse') { if (ev.button === 0) this.mouse.down = false; return; }
      for (const s of [this.move, this.aim]) {
        if (ev.pointerId !== s.id) continue;
        Object.assign(s, { active: false, id: -1, x: 0, y: 0 });
        s.el.classList.add('hidden');
      }
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('contextmenu', (ev) => { if (this.game) ev.preventDefault(); });
  }

  private knob(s: Stick) {
    (s.el.firstElementChild as HTMLElement).style.transform = `translate(${s.x * 55}px, ${s.y * 55}px)`;
  }

  private applySettings() {
    const s = this.settings;
    this.settingsEl.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
      const cur = String((s as unknown as Record<string, unknown>)[seg.dataset.key!]);
      seg.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
    });
    this.e.buttons?.classList.toggle('left', s.swap);
    this.sfx.enabled = s.sound;
    this.cb.settingsChanged(s);
  }

  private openSettings(inGame: boolean) {
    this.paused = inGame && !!this.game;
    this.settingsEl.querySelector('.leave')!.classList.toggle('hidden', !this.paused);
    (this.settingsEl.querySelector('.resume') as HTMLElement).textContent = this.paused ? 'WEITER' : 'ZURÜCK';
    this.settingsEl.classList.remove('hidden');
    this.mouse.down = false;
  }

  private closeSettings() {
    this.paused = false;
    this.settingsEl.classList.add('hidden');
  }

  showMenu() {
    this.game = null;
    this.paused = false;
    this.hud.classList.add('hidden');
    this.over.classList.add('hidden');
    this.settingsEl.classList.add('hidden');
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
    this.paused = false;
    this.menu.classList.add('hidden');
    this.over.classList.add('hidden');
    this.settingsEl.classList.add('hidden');
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
    this.ring.classList.add('hidden');
  }

  applyInput(game: Game, r: Renderer) {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    if (this.move.active) {
      // kleine Totzone, danach weich ansteigend
      const len = Math.hypot(this.move.x, this.move.y);
      if (len > 0.12) { mx += this.move.x; my += this.move.y; }
    }
    game.input.mx = mx;
    game.input.my = my;
    game.input.autoWeapon = this.touch;

    game.input.aim = null;
    game.input.firing = false;
    game.input.assist = false;
    const p = game.player;
    if (this.aim.active) {
      const len = Math.hypot(this.aim.x, this.aim.y);
      if (len > 0.15) {
        game.input.aim = Math.atan2(this.aim.y, this.aim.x);
        game.input.firing = len > 0.45;
        game.input.assist = this.settings.assist;
      }
    } else if (this.mouse.on && p.alive) {
      const w = r.groundPoint(this.mouse.x, this.mouse.y);
      if (w) {
        game.input.aim = Math.atan2(w.y - p.y, w.x - p.x);
        game.input.firing = this.mouse.down;
      }
    }
    if (this.pending.jump) game.input.jump = true;
    if (this.pending.heal) game.input.heal = true;
    if (this.pending.reload) game.input.reload = true;
    if (this.pending.pickup) game.input.pickup = true;
    this.pending = { jump: false, heal: false, reload: false, pickup: false };
  }

  handle(events: GameEvent[], game: Game, r: Renderer) {
    const p = game.player;
    const dist = (x: number, y: number) => Math.hypot(x - p.x, y - p.y);
    for (const ev of events) {
      switch (ev.type) {
        case 'shot':
          this.sfx.shot(ev.wid, ev.f === p ? 0 : dist(ev.x, ev.y));
          break;
        case 'explode':
          this.sfx.shot('rocket', dist(ev.x, ev.y) * 0.6);
          break;
        case 'hit':
          if (ev.byPlayer && ev.big) this.sfx.hit();
          break;
        case 'take':
          break;
        case 'crate':
          if (dist(ev.o.x, ev.o.y) < 300) this.sfx.crate();
          break;
        case 'jump':
          if (ev.f === p) this.sfx.jump();
          break;
        case 'kill': {
          const color = ev.me ? '#ff6b6b' : ev.mine ? '#ffd23f' : '#ffffff';
          const txt = ev.killer === 'Zone' ? `${ev.victim} von der Zone erwischt` : `${ev.killer} → ${ev.victim} (${ev.weapon})`;
          const el = document.createElement('div');
          el.textContent = txt;
          el.style.color = color;
          this.e.feed.append(el);
          this.feed.push({ el, t: performance.now() });
          while (this.feed.length > 5) this.feed.shift()!.el.remove();
          if (ev.mine) this.sfx.kill();
          break;
        }
        case 'toast':
          this.toast(ev.text, ev.color);
          if (ev.text.startsWith('+')) this.sfx.pickup();
          break;
        case 'damage':
          if (ev.toPlayer && ev.amount > 3) this.sfx.hurt();
          if ((ev.byPlayer || ev.toPlayer) && ev.amount > 0) {
            const s = r.project(ev.f.x, ev.f.y, 2.6);
            if (!s.on) break;
            const el = document.createElement('div');
            el.className = 'dmg';
            el.textContent = ev.toPlayer ? `-${ev.amount}` : String(ev.amount);
            el.style.color = ev.toPlayer ? '#ff5a5a' : ev.amount >= 40 ? '#ffd23f' : '#ffffff';
            el.style.transform = `translate(${s.x + (Math.random() - 0.5) * 20}px, ${s.y}px)`;
            this.labelsLayer.append(el);
            setTimeout(() => el.remove(), 750);
          }
          break;
        case 'heal':
          if (ev.f === p) this.toast(`+${ev.f.healAmt} Leben`, '#5dff7a');
          break;
        case 'gameover':
          setTimeout(() => this.showOver(ev.result), ev.result.win ? 700 : 1400);
          break;
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
    this.sfx.frame();
    const p = game.player;
    this.e.alive.textContent = String(game.aliveCount());
    this.e.kills.textContent = String(p.kills);
    const zi = game.zoneInfo();
    this.e.zone.textContent = zi.text;
    this.e.zone.classList.toggle('urgent', zi.urgent);
    this.e.warn.classList.toggle('hidden', !game.playerOutside());
    this.e.wname.textContent = p.weapon.name;
    this.e.wname.style.color = hex(TIER_COLORS[p.weapon.tier]);
    this.e.ammo.textContent = p.reloading ? 'Lädt…' : `${p.mag} / ${p.ammo}`;
    this.e.hpBar.style.width = `${Math.max(0, p.hp)}%`;
    this.e.hpBar.style.background = p.hp > 50 ? '' : p.hp > 25 ? '#ffcc00' : '#ff3b30';
    this.e.hpText.textContent = String(Math.ceil(Math.max(0, p.hp)));
    this.e.arBar.style.width = `${p.armor}%`;

    const inPlane = p.phase === 'plane';
    const ground = p.phase === 'ground' && p.alive && !game.over;
    this.e.jump.classList.toggle('hidden', !inPlane);
    this.e.buttons.classList.toggle('hidden', !ground);

    // Aufheben-Karte für Waffen
    const nw = ground && !this.touch && game.nearbyWeapon ? game.nearbyWeapon : null;
    this.e.pickcard.classList.toggle('hidden', !nw);
    if (nw) {
      const w = WEAPONS[nw.kind.slice(2) as WeaponId];
      const col = hex(TIER_COLORS[w.tier]);
      this.e.pickcard.style.borderColor = col;
      this.e.pcIcon.style.background = col;
      this.e.pcName.textContent = w.name;
      this.e.pcStats.textContent = `Schaden ${w.damage * w.pellets}  •  Reichweite ${Math.round(w.range / 10)} m  •  Magazin ${w.mag}`;
    }
    this.e.prompt.textContent = p.phase === 'fall' ? 'Lenk deinen Fallschirm zum Landeplatz' : '';

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
      const s = r.project(f.x, f.y, 2.9);
      if (!s.on) {
        l.el.style.display = 'none';
        continue;
      }
      l.el.style.display = '';
      l.el.style.transform = `translate(${s.x}px, ${s.y - 34}px)`;
      l.hp.style.width = `${Math.max(0, f.hp)}%`;
      l.hp.style.background = f.hp > 50 ? '' : f.hp > 25 ? '#ffcc00' : '#ff3b30';
      l.ar.parentElement!.style.visibility = f.armor > 0 ? 'visible' : 'hidden';
      l.ar.style.width = `${f.armor}%`;
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
    g.fillStyle = '#ecd59a';
    g.fillRect(0, 0, 320, 320);
    g.fillStyle = '#86c95a';
    g.beginPath();
    g.roundRect(6, 6, 308, 308, 16);
    g.fill();
    g.fillStyle = 'rgba(70,140,50,0.55)';
    for (const f of game.map.forests) { g.beginPath(); g.arc(f.x * k, f.y * k, f.r * k, 0, 7); g.fill(); }
    g.fillStyle = '#e6c86e';
    for (const f of game.map.fields) g.fillRect((f.x - f.w / 2) * k, (f.y - f.h / 2) * k, f.w * k, f.h * k);
    g.fillStyle = '#3aa6dc';
    for (const p of game.map.ponds) { g.beginPath(); g.arc(p.x * k, p.y * k, p.r * k, 0, 7); g.fill(); }
    for (const o of game.map.obstacles) {
      if (o.kind === 'rock') { g.fillStyle = '#9aa0a8'; g.beginPath(); g.arc(o.x * k, o.y * k, Math.max(1.5, o.r * k), 0, 7); g.fill(); }
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
    for (const o of game.obstacles) {
      if (!isContainer(o) || o.opened) continue;
      g.fillStyle = o.kind === 'crate' ? '#ffd54a' : o.kind === 'chest' ? '#c070ff' : '#ff8a1e';
      const s = o.kind === 'crate' ? 3 : 5;
      g.fillRect(o.x * k - s / 2, o.y * k - s / 2, s, s);
    }
    for (const d of game.airdrops) {
      if (d.obstacle) continue;
      g.strokeStyle = '#ff8a1e';
      g.lineWidth = 2;
      g.beginPath(); g.arc(d.x * k, d.y * k, 7 + Math.sin(performance.now() / 150) * 2, 0, 7); g.stroke();
    }
    if (game.time < PLANE_TIME * 1.1) {
      const pl = game.plane;
      g.strokeStyle = 'rgba(255,255,255,0.65)';
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
      const pos = p.phase === 'plane' ? game.planePos() : p;
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.arc(pos.x * k, pos.y * k, 6, 0, 7); g.fill(); g.stroke();
    }
  }
}

