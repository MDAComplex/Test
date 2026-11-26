import { WORLD, FIGHTER_COUNT, PLANE_TIME } from '../config';
import { Game, Fighter, GameEvent, GameResult, lootLabel, isContainer } from '../sim/game';
import { Renderer } from '../render/renderer';
import { loadStats } from '../storage';
import { Settings, loadSettings, saveSettings } from '../settings';
import { Sfx } from '../sfx';
import { WEAPONS, TIER_COLORS, WeaponId } from '../weapons';
import { Preview } from './preview';
import { CHUTE_COLORS, CHUTE_LOGOS } from '../chute';
import { Profile, loadProfile, saveProfile, levelInfo, SKINS, skinColor, taskText, awardRound, RoundReward } from '../profile';

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
  private labels = new Map<Fighter, { el: HTMLElement; dn: HTMLElement }>();
  private ring: HTMLElement;
  private ringArc: SVGCircleElement;
  private move: Stick;
  private aim: Stick;
  private keys = new Set<string>();
  private pending = { jump: false, heal: false, reload: false, pickup: false, swap: false };
  private feed: { el: HTMLElement; t: number }[] = [];
  private lastMini = 0;
  private mouse = { on: false, x: 0, y: 0, down: false };
  /** zuletzt per Touch bedient (Handy/Tablet) */
  private touch = window.matchMedia('(hover: none)').matches;
  profile: Profile = loadProfile();
  private stepDist = 0;
  private lastStepPos = { x: 0, y: 0 };
  private zoneBeep = 0;
  private wasReloading = false;
  private reward: RoundReward | null = null;
  private tut = { step: -1, t: 0 };
  private rotateEl: HTMLElement;
  private lockerEl: HTMLElement;
  private preview: Preview | null = null;
  private previewChute = false;
  private dirsLayer: HTMLElement;
  private stickMax = 55;
  private teamRows: { f: Fighter; row: HTMLElement; bar: HTMLElement }[] = [];

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
        <div class="killnote hidden"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg><span class="kn-name"></span></div>
        <div class="bottom">
          <div class="wrow"><span class="wname"></span><span class="ammo"></span></div>
          <button class="altslot hidden"><span class="altname"></span><small class="altkey">Q</small></button>
          <div class="bar ar"><i></i></div>
          <div class="bar hp"><i></i><span></span></div>
        </div>
        <div class="buttons">
          <button class="rb reload">Laden<small>R</small></button>
        </div>
        <button class="rb jump hidden">SPRINGEN<small>Leertaste</small></button>
        <div class="tip hidden"></div>
        <div class="team hidden"></div>
        <div class="downnote hidden"><b>Du bist niedergeschlagen</b><span>Dein Team kann dich wiederbeleben</span><div class="bar"><i></i></div></div>
        <div class="specbar hidden"><span>Du schaust zu: <b class="specname"></b></span><button class="btn secondary toresult">ERGEBNIS</button></div>
        <div class="joy move hidden"><i></i></div>
        <div class="joy aim hidden"><i></i></div>
      </div>`);
    this.menu = $(`
      <div class="screen" id="menu">
        <div class="title">ZONE RUSH</div>
        <div class="subtitle msub"></div>
        <div class="seg modeseg" role="radiogroup" aria-label="Spielmodus">
          <button data-mode="solo">Solo</button><button data-mode="duo">Duo</button><button data-mode="squad">Squad</button>
        </div>
        <button class="btn pulse play">SPIELEN</button>
        <div class="menurow"><button class="btn secondary openlocker">SPIND</button><button class="btn secondary opensettings">EINSTELLUNGEN</button></div>
        <div class="prof">
          <div class="lvl"><span class="lvlnum"></span><div class="xpbar"><i></i></div><small class="xptext"></small></div>
          <div class="daily"><b>Tägliche Aufgaben</b><div class="tasks"></div></div>
        </div>
        <div class="stats"></div>
        <div class="help">
          <b>PC:</b> WASD laufen  •  Maus zielen  •  Linksklick schießen  •  auf Gegenstände stellen zum Aufheben  •  Q Waffe wechseln  •  R nachladen<br>
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
        <div class="reward"></div>
        <button class="btn again">NOCHMAL</button>
        <button class="btn secondary watch">ZUSCHAUEN</button>
        <button class="btn secondary tomenu">MENÜ</button>
      </div>`);
    this.settingsEl = $(`
      <div class="screen hidden" id="settings">
        <div class="panel">
          <h2>Einstellungen</h2>
          <div class="row"><span>Steuerung am Handy</span><div class="seg" data-key="swap">
            <button data-v="false">Links laufen · Rechts zielen</button><button data-v="true">Links zielen · Rechts laufen</button></div></div>
          <div class="row"><span>Grafik</span><div class="seg" data-key="quality"><button data-v="auto">Automatisch</button><button data-v="high">Hoch</button><button data-v="low">Niedrig (flüssiger)</button></div></div>
          <div class="row"><span>Stick-Größe am Handy</span><div class="seg" data-key="stick"><button data-v="small">Klein</button><button data-v="medium">Mittel</button><button data-v="large">Groß</button></div></div>
          <div class="row"><span>Ton</span><div class="seg" data-key="sound"><button data-v="true">An</button><button data-v="false">Aus</button></div></div>
          <div class="actions">
            <button class="btn resume">WEITER</button>
            <button class="btn secondary leave">RUNDE VERLASSEN</button>
          </div>
        </div>
      </div>`);
    this.ring = $(`<div class="pring hidden"><svg viewBox="0 0 60 60" width="60" height="60"><circle cx="30" cy="30" r="26" class="bg"/><circle cx="30" cy="30" r="26" class="fg"/></svg></div>`);
    this.lockerEl = $(`
      <div class="screen hidden" id="locker">
        <div class="panel lockpanel">
          <h2>Spind</h2>
          <div class="lockgrid">
            <canvas class="pv" width="260" height="300" aria-label="Vorschau deiner Figur"></canvas>
            <div class="lockopts">
              <div class="row"><span>Figur</span><div class="seg" data-lock="char"><button data-v="man">Mann</button><button data-v="woman">Frau</button></div></div>
              <div class="row"><span>Outfit</span><div class="seg" data-lock="outfit"><button data-v="none">Normal</button><button data-v="astronaut">Astronaut</button><button data-v="skeleton">Skelett</button><button data-v="office">Büro</button><button data-v="jogger">Jogger</button></div></div>
              <div class="row"><span>Farbe</span><div class="skins" aria-label="Farbe deiner Figur"></div></div>
              <div class="row"><span>Fallschirm</span><div class="seg" data-lock="chute"><button data-v="round">Rundkappe</button><button data-v="wing">Gleitschirm</button></div></div>
              <div class="row"><span>Schirmfarbe</span><div class="swatches" data-cd="color"></div></div>
              <div class="row"><span>Streifen</span><div class="swatches" data-cd="accent"></div></div>
              <div class="row"><span>Logo</span><div class="seg logos">${CHUTE_LOGOS.map((l) => `<button data-logo="${l.id}">${l.name}</button>`).join('')}</div></div>
              <div class="row"><label for="chute-text">Text auf dem Schirm</label><input id="chute-text" class="chutetext" maxlength="12" placeholder="z. B. dein Name" autocomplete="off"></div>
            </div>
          </div>
          <div class="actions"><button class="btn closelocker">FERTIG</button></div>
        </div>
      </div>`);
    this.rotateEl = $(`<div class="screen hidden" id="rotate"><div class="rot-icon"></div><div class="subtitle">Bitte dreh dein Handy quer</div></div>`);
    this.dirsLayer = $(`<div class="dirs"></div>`);
    document.body.append(this.labelsLayer, this.dirsLayer, this.hud, this.menu, this.over, this.settingsEl, this.lockerEl, this.rotateEl);
    this.labelsLayer.append(this.ring);
    this.ringArc = this.ring.querySelector('.fg') as SVGCircleElement;
    this.ringArc.style.strokeDasharray = String(RING_C);

    for (const k of ['alive', 'kills', 'zone', 'warn', 'feed', 'center', 'toast', 'prompt', 'wname', 'ammo', 'jump', 'reload', 'pickcard', 'buttons', 'gear', 'altslot', 'altname', 'tip', 'specbar', 'specname', 'killnote', 'team', 'downnote']) {
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
    const firstTouch = () => {
      startAudio();
      if (!this.game) this.sfx.menuMusic(true);
      window.removeEventListener('pointerdown', firstTouch);
    };
    window.addEventListener('pointerdown', firstTouch);
    this.menu.querySelector('.play')!.addEventListener('click', () => { startAudio(); this.cb.play(); });
    this.menu.querySelector('.opensettings')!.addEventListener('click', () => this.openSettings(false));
    this.menu.querySelector('.openlocker')!.addEventListener('click', () => this.openLocker());
    this.lockerEl.querySelector('.closelocker')!.addEventListener('click', () => this.closeLocker());
    // Fallschirm-Design: Farben, Logo, Text
    this.lockerEl.querySelectorAll<HTMLElement>('.swatches').forEach((box) => {
      const key = box.dataset.cd as 'color' | 'accent';
      for (const c of CHUTE_COLORS) {
        const b = document.createElement('button');
        b.className = 'sw';
        b.dataset.c = String(c);
        b.style.setProperty('--c', '#' + c.toString(16).padStart(6, '0'));
        b.setAttribute('aria-label', key === 'color' ? 'Schirmfarbe' : 'Streifenfarbe');
        b.addEventListener('click', () => { this.profile.chuteDesign[key] = c; this.previewChute = true; saveProfile(this.profile); this.renderProfile(); });
        box.append(b);
      }
    });
    this.lockerEl.querySelectorAll<HTMLButtonElement>('.logos button').forEach((b) =>
      b.addEventListener('click', () => { this.profile.chuteDesign.logo = b.dataset.logo as never; this.previewChute = true; saveProfile(this.profile); this.renderProfile(); }));
    const txt = this.lockerEl.querySelector('.chutetext') as HTMLInputElement;
    txt.addEventListener('input', () => { this.profile.chuteDesign.text = txt.value.slice(0, 12); this.previewChute = true; saveProfile(this.profile); this.renderProfile(); });
    txt.addEventListener('keydown', (ev) => ev.stopPropagation());
    this.lockerEl.querySelectorAll<HTMLElement>('[data-lock]').forEach((seg) =>
      seg.querySelectorAll<HTMLButtonElement>('button').forEach((b) =>
        b.addEventListener('click', () => {
          const key = seg.dataset.lock as 'char' | 'chute' | 'outfit';
          (this.profile as unknown as Record<string, string>)[key] = b.dataset.v!;
          this.previewChute = key === 'chute';
          saveProfile(this.profile);
          this.renderProfile();
        }),
      ),
    );
    this.over.querySelector('.again')!.addEventListener('click', () => { startAudio(); this.cb.play(); });
    this.over.querySelector('.tomenu')!.addEventListener('click', () => this.cb.menu());
    this.e.gear.addEventListener('click', () => this.openSettings(true));
    this.menu.querySelectorAll<HTMLButtonElement>('.modeseg button').forEach((b) =>
      b.addEventListener('click', () => {
        this.settings.mode = b.dataset.mode as Settings['mode'];
        saveSettings(this.settings);
        this.renderMode();
      }),
    );
    this.e.altslot.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); this.pending.swap = true; });
    this.over.querySelector('.watch')!.addEventListener('click', () => {
      if (!this.game) return;
      this.game.spectate = this.game.nextSpectate(this.game.player);
      this.over.classList.add('hidden');
      this.e.specbar.classList.remove('hidden');
    });
    this.e.specbar.querySelector('.toresult')!.addEventListener('click', () => {
      this.e.specbar.classList.add('hidden');
      this.over.classList.remove('hidden');
    });
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
      if (ev.code === 'KeyQ' || ev.code === 'Digit1' || ev.code === 'Digit2') this.pending.swap = true;
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
        const len = Math.hypot(dx, dy), max = this.stickMax;
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
    (s.el.firstElementChild as HTMLElement).style.transform = `translate(${s.x * this.stickMax}px, ${s.y * this.stickMax}px)`;
  }

  private applySettings() {
    const s = this.settings;
    this.settingsEl.querySelectorAll<HTMLElement>('.seg').forEach((seg) => {
      const cur = String((s as unknown as Record<string, unknown>)[seg.dataset.key!]);
      seg.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
    });
    this.e.buttons?.classList.toggle('left', s.swap);
    this.sfx.enabled = s.sound;
    if (!s.sound) this.sfx.menuMusic(false);
    else if (!this.game) this.sfx.menuMusic(true);
    this.stickMax = s.stick === 'small' ? 44 : s.stick === 'large' ? 70 : 55;
    for (const st of [this.move, this.aim]) {
      if (!st) continue;
      st.el.style.width = st.el.style.height = `${this.stickMax * 2 + 10}px`;
      st.el.style.margin = `-${this.stickMax + 5}px 0 0 -${this.stickMax + 5}px`;
    }
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
    this.e.specbar.classList.add('hidden');
    this.renderProfile();
    this.renderMode();
    this.sfx.menuMusic(true);
  }

  get playerColor() { return skinColor(this.profile); }
  get playerLook() { return { char: this.profile.char, chute: this.profile.chute, outfit: this.profile.outfit, design: { ...this.profile.chuteDesign } }; }

  private openLocker() {
    this.menu.classList.add('hidden');
    this.lockerEl.classList.remove('hidden');
    if (!this.preview) this.preview = new Preview(this.lockerEl.querySelector('.pv') as HTMLCanvasElement);
    this.previewChute = false;
    this.renderProfile();
    this.preview.start();
  }

  private closeLocker() {
    this.lockerEl.classList.add('hidden');
    this.menu.classList.remove('hidden');
    this.renderProfile();
    this.preview?.stop();
  }

  private renderMode() {
    const m = this.settings.mode;
    this.menu.querySelectorAll<HTMLElement>('.modeseg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    this.menu.querySelector('.msub')!.textContent =
      m === 'solo' ? `3D Battle Royale  •  ${FIGHTER_COUNT} Kämpfer  •  Nur einer überlebt`
      : m === 'duo' ? '3D Battle Royale  •  12 Teams à 2  •  Das letzte Team gewinnt'
      : '3D Battle Royale  •  6 Teams à 4  •  Das letzte Team gewinnt';
  }

  private renderProfile() {
    const pr = this.profile;
    const li = levelInfo(pr.xp);
    this.menu.querySelector('.lvlnum')!.textContent = `Level ${li.level}`;
    (this.menu.querySelector('.xpbar i') as HTMLElement).style.width = `${(li.into / li.need) * 100}%`;
    this.menu.querySelector('.xptext')!.textContent = `${li.into} / ${li.need} XP`;
    const sk = this.lockerEl.querySelector('.skins')!;
    sk.innerHTML = '';
    for (const skin of SKINS) {
      const locked = li.level < skin.level;
      const b = document.createElement('button');
      b.className = 'skin' + (pr.skin === skin.id ? ' on' : '') + (locked ? ' locked' : '');
      b.style.setProperty('--c', hex(skin.color));
      b.title = locked ? `${skin.name}: ab Level ${skin.level}` : skin.name;
      b.setAttribute('aria-label', b.title);
      b.innerHTML = locked ? `<small>${skin.level}</small>` : '';
      if (!locked) b.addEventListener('click', () => { pr.skin = skin.id; this.previewChute = false; saveProfile(pr); this.renderProfile(); });
      sk.append(b);
    }
    this.lockerEl.querySelectorAll<HTMLElement>('[data-lock]').forEach((seg) => {
      const cur = (pr as unknown as Record<string, string>)[seg.dataset.lock!];
      seg.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', b.dataset.v === cur));
    });
    const cd = pr.chuteDesign;
    this.lockerEl.querySelectorAll<HTMLElement>('.swatches').forEach((box) =>
      box.querySelectorAll<HTMLElement>('.sw').forEach((b) => b.classList.toggle('on', Number(b.dataset.c) === cd[box.dataset.cd as 'color' | 'accent'])));
    this.lockerEl.querySelectorAll<HTMLElement>('.logos button').forEach((b) => b.classList.toggle('on', b.dataset.logo === cd.logo));
    const ti = this.lockerEl.querySelector('.chutetext') as HTMLInputElement;
    if (document.activeElement !== ti) ti.value = cd.text;
    this.preview?.set(pr.char, skinColor(pr), pr.chute, this.previewChute, pr.outfit, cd);
    const tl = this.menu.querySelector('.tasks')!;
    tl.innerHTML = '';
    for (const t of pr.daily.tasks) {
      const row = document.createElement('div');
      row.className = 'task' + (t.done ? ' done' : '');
      const shown = t.kind === 'survive' ? `${Math.floor(t.progress / 60)}/${Math.round(t.target / 60)} min` : `${t.progress}/${t.target}`;
      row.innerHTML = `<span></span><b>${t.done ? 'Erledigt' : shown}</b>`;
      row.querySelector('span')!.textContent = taskText(t);
      tl.append(row);
    }
  }

  /** Handy im Hochformat: Spiel pausieren und zum Drehen auffordern */
  blocked() {
    const b = !!this.game && this.touch && window.innerHeight > window.innerWidth;
    this.rotateEl.classList.toggle('hidden', !b);
    return b;
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
    this.reward = null;
    this.sfx.menuMusic(false);
    this.e.specbar.classList.add('hidden');
    this.tut = { step: this.profile.tutorialDone ? -1 : 0, t: 0 };
    this.lastStepPos = { x: game.player.x, y: game.player.y };
    this.buildMiniBase(game);
    this.e.team.innerHTML = '';
    this.teamRows = [];
    const mates = game.mode === 'solo' ? [] : game.teammates(game.player);
    this.e.team.classList.toggle('hidden', mates.length === 0);
    for (const m of mates) {
      const row = $(`<div class="tm"><span class="tm-n"></span><div class="tm-bar"><i></i></div></div>`);
      row.querySelector('.tm-n')!.textContent = m.name;
      this.e.team.append(row);
      this.teamRows.push({ f: m, row, bar: row.querySelector('i') as HTMLElement });
    }
    for (const f of game.fighters) {
      if (f.isPlayer) continue;
      const el = $(`<div class="lbl"><div class="n"></div><div class="b dn"><i></i></div></div>`);
      if (game.mode !== 'solo' && f.team === game.player.team) el.classList.add('mate');
      el.querySelector('.n')!.textContent = f.name;
      this.labelsLayer.append(el);
      this.labels.set(f, { el, dn: el.querySelector('.dn') as HTMLElement });
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
    // Aufheben überall gleich: kurz auf dem Gegenstand stehen bleiben
    game.input.autoWeapon = true;

    game.input.aim = null;
    game.input.firing = false;
    const p = game.player;
    if (this.aim.active) {
      const len = Math.hypot(this.aim.x, this.aim.y);
      if (len > 0.15) {
        game.input.aim = Math.atan2(this.aim.y, this.aim.x);
        game.input.firing = len > 0.45;
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
    if (this.pending.swap) game.input.swap = true;
    this.pending = { jump: false, heal: false, reload: false, pickup: false, swap: false };
  }

  handle(events: GameEvent[], game: Game, r: Renderer) {
    const p = game.player;
    const dist = (x: number, y: number) => Math.hypot(x - p.x, y - p.y);
    for (const ev of events) {
      switch (ev.type) {
        case 'shot':
          this.sfx.shot(ev.wid, ev.f === p ? 0 : dist(ev.x, ev.y));
          break;
        case 'punch':
          if (dist(ev.f.x, ev.f.y) < 500) this.sfx.punch(ev.hit);
          break;
        case 'explode':
          this.sfx.shot('rocket', dist(ev.x, ev.y) * 0.6);
          break;
        case 'hit':
          if (ev.byPlayer && ev.big) {
            this.sfx.hit();
            this.hitMarker(r, ev.x, ev.y, false);
          }
          break;
        case 'airdrop':
          this.sfx.incoming();
          break;
        case 'down': {
          const mine = ev.by === p, me = ev.f === p;
          const who = mine ? 'Du hast' : `${ev.by ? ev.by.name : 'Die Zone'} hat`;
          this.feedLine(`${who} ${me ? 'dich' : ev.f.name} niedergeschlagen`, me ? '#ff6b6b' : mine ? '#ffb347' : '#dddddd');
          if (mine) { this.sfx.hit(); this.hitMarker(r, ev.f.x, ev.f.y, false); }
          if (me) this.sfx.hurt();
          break;
        }
        case 'revive':
          if (ev.f.team === p.team) this.feedLine(ev.f === p ? 'Du wurdest wiederbelebt' : `${ev.f.name} wurde wiederbelebt`, '#6fe08b');
          break;
        case 'playerOut':
          this.notice('Du bist raus. Du schaust deinem Team zu');
          if (game.spectate) {
            this.e.specbar.classList.remove('hidden');
            (this.e.specbar.querySelector('.toresult') as HTMLElement).classList.add('hidden');
          }
          break;
        case 'pickup':
          this.sfx.pickup();
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
          this.feedLine(txt, color);
          if (ev.mine) { this.sfx.kill(); this.hitMarker(r, ev.f.x, ev.f.y, true); this.killNote(ev.victim); }
          break;
        }
        case 'toast':
          this.toast(ev.text, ev.color);
          break;
        case 'damage':
          if (ev.toPlayer && ev.amount > 3) this.sfx.hurt();
          if (ev.toPlayer && ev.fromX !== null && ev.fromY !== null) this.damageDir(Math.atan2(ev.fromY - p.y, ev.fromX - p.x));
          if ((ev.byPlayer || ev.toPlayer) && ev.amount > 0) {
            const s = r.project(ev.f.x, ev.f.y, 2.6);
            if (!s.on) break;
            const el = document.createElement('div');
            el.className = 'dmg';
            el.textContent = ev.toPlayer ? `-${ev.amount}` : String(ev.amount);
            // Treffer auf Schild = blau, auf Leben = weiß
            el.style.color = ev.toPlayer ? '#ff5a5a' : ev.shield ? '#5fb4ff' : '#ffffff';
            el.style.transform = `translate(${s.x + (Math.random() - 0.5) * 20}px, ${s.y}px)`;
            this.labelsLayer.append(el);
            setTimeout(() => el.remove(), 750);
          }
          break;
        case 'gameover': {
          const rs = ev.result;
          this.reward = awardRound(this.profile, {
            place: rs.place, kills: rs.kills, win: rs.win, seconds: Math.max(0, (rs.time - PLANE_TIME) / 1000),
            chests: game.stats.chests, airdrops: game.stats.airdrops, shields: game.stats.shields,
          });
          if (!this.profile.tutorialDone) { this.profile.tutorialDone = true; saveProfile(this.profile); }
          setTimeout(() => this.showOver(rs), rs.win ? 900 : 2600);
          break;
        }
      }
    }
  }

  notice(text: string) { this.toast(text, '#ffffff'); }

  private toast(text: string, color: string) {
    const t = this.e.toast;
    t.textContent = text;
    t.style.color = color;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
  }

  /** kleines Kreuz an der Trefferstelle; rot und größer beim Abschuss */
  private hitMarker(r: Renderer, x: number, y: number, kill: boolean) {
    const s = r.project(x, y, 1.2);
    if (!s.on) return;
    const el = document.createElement('div');
    el.className = 'hitmark' + (kill ? ' kill' : '');
    el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    this.labelsLayer.append(el);
    setTimeout(() => el.remove(), kill ? 600 : 260);
  }

  private feedLine(txt: string, color: string) {
    const el = document.createElement('div');
    el.textContent = txt;
    el.style.color = color;
    this.e.feed.append(el);
    this.feed.push({ el, t: performance.now() });
    while (this.feed.length > 5) this.feed.shift()!.el.remove();
  }

  /** kleines Fadenkreuz mit Namen über der Lebensleiste, blendet wieder aus */
  private killNoteTimer = 0;
  private killNote(name: string) {
    const el = this.e.killnote;
    el.querySelector('.kn-name')!.textContent = name;
    el.classList.remove('hidden', 'show');
    void el.offsetWidth;
    el.classList.add('show');
    window.clearTimeout(this.killNoteTimer);
    this.killNoteTimer = window.setTimeout(() => el.classList.add('hidden'), 2300);
  }

  /** roter Bogen am Bildschirmrand: aus dieser Richtung kam der Schaden */
  private damageDir(angle: number) {
    const el = document.createElement('div');
    el.className = 'dmgdir';
    el.style.transform = `rotate(${angle + Math.PI / 2}rad)`;
    this.dirsLayer.append(el);
    setTimeout(() => el.remove(), 1100);
  }

  private showOver(r: GameResult) {
    if (!this.game) return;
    this.e.toast.classList.remove('show');
    this.e.tip.classList.add('hidden');
    this.e.specbar.classList.add('hidden');
    const rw = this.reward;
    const box = this.over.querySelector('.reward') as HTMLElement;
    box.innerHTML = '';
    if (rw) {
      const head = document.createElement('div');
      head.className = 'rw-head';
      head.textContent = `+${rw.xp} XP` + (rw.levelAfter > rw.levelBefore ? `  •  Level ${rw.levelAfter} erreicht!` : '');
      box.append(head);
      for (const l of rw.lines) { const d = document.createElement('div'); d.textContent = l; box.append(d); }
      for (const t of rw.tasksDone) { const d = document.createElement('div'); d.className = 'rw-task'; d.textContent = `Aufgabe erledigt: ${t}`; box.append(d); }
    }
    this.over.querySelector('.watch')!.classList.toggle('hidden', r.win || this.game.aliveCount() < 1);
    const big = this.over.querySelector('.big') as HTMLElement;
    big.textContent = r.win ? 'SIEG!' : `Platz #${r.place}`;
    (this.e.specbar.querySelector('.toresult') as HTMLElement).classList.remove('hidden');
    big.classList.toggle('win', r.win);
    const solo = this.game.mode === 'solo';
    this.over.querySelector('.osub')!.textContent = r.win
      ? (solo ? 'Du bist der letzte Überlebende' : 'Dein Team hat gewonnen')
      : solo ? `von ${r.teams} Kämpfern` : `von ${r.teams} Teams`;
    const s = Math.floor(r.time / 1000);
    this.over.querySelector('.ostats')!.textContent = `Abschüsse: ${r.kills}   •   Überlebt: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.over.classList.remove('hidden');
  }

  update(game: Game, r: Renderer) {
    this.sfx.frame();
    const p = game.player;
    // Schritte, Zonenwarnung, Flugzeug, Nachladen
    if (p.alive && p.phase === 'ground') {
      this.stepDist += Math.hypot(p.x - this.lastStepPos.x, p.y - this.lastStepPos.y);
      if (this.stepDist > 70) { this.stepDist = 0; this.sfx.step(); }
    }
    this.lastStepPos = { x: p.x, y: p.y };
    if (game.playerOutside() && game.time > this.zoneBeep) { this.zoneBeep = game.time + 1000; this.sfx.zoneWarn(); }
    this.sfx.planeHum(p.phase === 'plane' ? 1 : game.time < PLANE_TIME * 1.2 ? 0.3 : 0);
    if (p.reloading && !this.wasReloading) this.sfx.reload();
    this.wasReloading = p.reloading;
    // zweiter Waffenplatz
    this.e.altslot.classList.toggle('hidden', !p.backup || !p.alive);
    if (p.backup) {
      this.e.altname.textContent = p.backup.w.name;
      this.e.altname.style.color = hex(TIER_COLORS[p.backup.w.tier]);
      this.e.altslot.querySelector('.altkey')!.textContent = this.touch ? 'Tippen' : 'Q';
    }
    // Teamleiste
    for (const t of this.teamRows) {
      const f = t.f;
      t.row.classList.toggle('dead', !f.alive);
      t.row.classList.toggle('down', f.alive && f.downed);
      t.bar.style.width = `${!f.alive ? 0 : f.downed ? f.downHp : Math.max(0, f.hp)}%`;
    }
    this.e.downnote.classList.toggle('hidden', !(p.alive && p.downed));
    if (p.downed) (this.e.downnote.querySelector('i') as HTMLElement).style.width = `${p.downHp}%`;
    // Zuschauen
    if (game.spectate && !this.e.specbar.classList.contains('hidden')) this.e.specname.textContent = game.spectate.name;
    this.updateTutorial(game);
    this.e.alive.textContent = String(game.aliveCount());
    this.e.kills.textContent = String(p.kills);
    const zi = game.zoneInfo();
    this.e.zone.textContent = zi.text;
    this.e.zone.classList.toggle('urgent', zi.urgent);
    this.e.warn.classList.toggle('hidden', !game.playerOutside());
    this.e.wname.textContent = p.weapon.name;
    this.e.wname.style.color = hex(TIER_COLORS[p.weapon.tier]);
    this.e.ammo.textContent = p.weapon.id === 'fists' ? 'Nahkampf' : p.reloading ? 'Lädt…' : `${p.mag} / ${p.ammo}`;
    this.e.hpBar.style.width = `${Math.max(0, p.hp)}%`;
    this.e.hpBar.style.background = p.hp > 50 ? '' : p.hp > 25 ? '#ffcc00' : '#ff3b30';
    this.e.hpText.textContent = String(Math.ceil(Math.max(0, p.hp)));
    this.e.arBar.style.width = `${p.armor}%`;

    const inPlane = p.phase === 'plane';
    const ground = p.phase === 'ground' && p.alive && !game.over;
    this.e.jump.classList.toggle('hidden', !inPlane);
    this.e.buttons.classList.toggle('hidden', !ground || p.downed || p.weapon.id === 'fists');

    // Aufheben-Karte für Waffen
    const nw = null as typeof game.nearbyWeapon;
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
      l.el.style.transform = `translate(${s.x}px, ${s.y - 18}px)`;
      // rote Leiste nur bei Niedergeschlagenen
      l.dn.style.display = f.downed ? '' : 'none';
      if (f.downed) (l.dn.firstElementChild as HTMLElement).style.width = `${Math.max(0, f.downHp)}%`;
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

  private updateTutorial(game: Game) {
    const p = game.player;
    const tip = this.e.tip;
    if (this.tut.step < 0 || !p.alive) { tip.classList.add('hidden'); return; }
    const now = game.time;
    const t = this.touch;
    const steps: { text: string; until: () => boolean }[] = [
      { text: t ? 'Tippe SPRINGEN, wenn du über deinem Wunschort bist' : 'Drück die Leertaste, wenn du über deinem Wunschort bist', until: () => p.phase !== 'plane' },
      { text: t ? 'Lenk den Fallschirm mit dem linken Stick' : 'Lenk den Fallschirm mit WASD', until: () => p.phase === 'ground' },
      { text: t ? 'Linker Stick: laufen  •  Rechter Stick: zielen, weit ziehen = schießen' : 'WASD: laufen  •  Maus: zielen  •  Linksklick: schießen', until: () => now - this.tut.t > 6500 },
      { text: 'Stell dich auf Gegenstände, um sie aufzuheben. Loot-Kisten stehen in Häusern', until: () => now - this.tut.t > 6500 },
      { text: 'Bleib innerhalb der Zone. Viel Glück!', until: () => now - this.tut.t > 5000 },
    ];
    const cur = steps[this.tut.step];
    if (!cur) {
      this.tut.step = -1;
      this.profile.tutorialDone = true;
      saveProfile(this.profile);
      tip.classList.add('hidden');
      return;
    }
    tip.textContent = cur.text;
    tip.classList.remove('hidden');
    if (cur.until()) { this.tut.step++; this.tut.t = now; }
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
    g.fillStyle = '#4f9a3a';
    for (const gf of game.map.grass) { g.beginPath(); g.arc(gf.x * k, gf.y * k, gf.r * k, 0, 7); g.fill(); }
    const rv = game.map.river;
    g.strokeStyle = '#3aa6dc';
    g.lineWidth = rv.width * k;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    rv.pts.forEach((pt, i) => (i ? g.lineTo(pt.x * k, pt.y * k) : g.moveTo(pt.x * k, pt.y * k)));
    g.stroke();
    g.fillStyle = '#b07c48';
    for (const b of rv.bridges) {
      g.save();
      g.translate(b.x * k, b.y * k);
      g.rotate(b.angle);
      g.fillRect(-4, -(rv.width + 150) * k / 2, 8, (rv.width + 150) * k);
      g.restore();
    }
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
      g.fillStyle = o.kind === 'crate' ? '#ffd54a' : o.kind === 'chest' ? '#ffc93c' : '#ff8a1e';
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
    if (game.mode !== 'solo') {
      g.fillStyle = '#4aa8ff'; g.strokeStyle = '#000'; g.lineWidth = 2;
      for (const m of game.teammates(p)) {
        if (!m.alive) continue;
        const pos = m.phase === 'plane' ? game.planePos() : m;
        g.beginPath(); g.arc(pos.x * k, pos.y * k, 5, 0, 7); g.fill(); g.stroke();
      }
    }
    if (p.alive) {
      const pos = p.phase === 'plane' ? game.planePos() : p;
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 2;
      g.beginPath(); g.arc(pos.x * k, pos.y * k, 6, 0, 7); g.fill(); g.stroke();
    }
  }
}

