import { WORLD, FIGHTER_COUNT, PLANE_TIME } from '../config';
import { CHUTE_Z } from '../sim/game';
import { Game, Fighter, GameEvent, GameResult, lootLabel, isContainer } from '../sim/game';
import { Renderer } from '../render/renderer';
import { loadStats } from '../storage';
import { Settings, loadSettings, saveSettings } from '../settings';
import { Sfx } from '../sfx';
import { WEAPONS, TIER_COLORS, WeaponId, parseWeapon, RARITY_NAMES } from '../weapons';
import { Preview } from './preview';
import { portrait, gunIcon } from './portrait';
import { CHUTE_COLORS, CHUTE_LOGOS } from '../chute';
import { Profile, loadProfile, saveProfile, levelInfo, SKINS, skinColor, taskText, awardRound, RoundReward } from '../profile';

const $ = <T extends HTMLElement>(html: string) => {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as T;
};
const HIT_MARKS = false as boolean;
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
  private bigBase: HTMLCanvasElement | null = null;
  private bigOpen = false;
  private bigCanvas!: HTMLCanvasElement;
  private tabHeld = false;
  /** Ich-Perspektive: Blickrichtung (Gier/Neigung) */
  fppYaw = 0;
  fppPitch = -0.05;
  private fppWas = false;
  private look = { id: -1, x: 0, y: 0 };
  private fireHeld = false;
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
  private lobbyPv: Preview | null = null;
  private dropCanvas!: HTMLCanvasElement;
  private lastTick = -1;
  private wIconKey = '';
  private previewChute = false;
  private dirsLayer: HTMLElement;
  private stickMax = 55;
  private teamRows: { f: Fighter; row: HTMLElement; bar: HTMLElement; ar: HTMLElement }[] = [];

  constructor(private cb: { play: () => void; menu: () => void; settingsChanged: (s: Settings) => void }) {
    this.labelsLayer = $('<div id="labels"></div>');
    this.hud = $(`
      <div id="hud" class="hidden">
        <button class="gear" aria-label="Einstellungen"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg></button>
        <div class="zone"></div>
        <div class="warn hidden">Du bist außerhalb der Zone!</div>
        <canvas class="mini" width="320" height="320" aria-label="Karte (tippen für groß)"></canvas>
        <div class="bigmap hidden"><canvas width="1536" height="1536" aria-label="Große Karte"></canvas><div class="bighint"></div></div>
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
          <div class="wrow"><span class="wslot"><img class="wicon" alt=""><span class="wname"></span></span><span class="ammo"></span></div>
          <button class="altslot hidden"><span class="altname"></span><small class="altkey">Q</small></button>
          <div class="bar ar"><i></i></div>
          <div class="bar hp"><i></i><span></span></div>
        </div>
        <div class="buttons">
          <button class="rb reload">Laden<small>R</small></button>
        </div>
        <button class="rb jump hidden">SPRINGEN<small>Leertaste</small></button>
        <div class="dropsel hidden">
          <div class="ds-map"><canvas width="1536" height="1536" aria-label="Landepunkt wählen"></canvas></div>
          <div class="ds-side">
            <div class="ds-title">Wähle deinen<br>Landepunkt</div>
            <div class="ds-timer"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg"/></svg><b class="ds-num">15</b></div>
            <div class="ds-hint"></div>
            <div class="ds-team"></div>
          </div>
        </div>
        <div class="whiteflash"></div>
        <div class="tip hidden"></div>
        <div class="team hidden"></div>
        <div class="downnote hidden"><b>Du bist niedergeschlagen</b><span>Dein Team kann dich wiederbeleben</span><div class="bar"><i></i></div></div>
        <div class="specbar hidden"><span>Du schaust zu: <b class="specname"></b></span><button class="btn secondary toresult">ERGEBNIS</button></div>
        <div class="xhair hidden"></div>
        <button class="rb fire hidden">FEUER</button>
        <div class="joy move hidden"><i></i></div>
        <div class="joy aim hidden"><i></i></div>
      </div>`);
    this.menu = $(`
      <div class="screen lobby" id="menu">
        <div class="lb-vignette"></div>
        <div class="lb-top">
          <div class="lb-prof">
            <img class="lb-av" alt="">
            <div class="lvl"><span class="lvlnum"></span><div class="xpbar"><i></i></div><small class="xptext"></small></div>
          </div>
          <div class="lb-logo"><div class="title">ZONE RUSH</div><div class="subtitle msub"></div></div>
          <div class="lb-actions">
            <button class="lb-icon openlocker" aria-label="Spind"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 2a4 4 0 0 1 4 4h3l2 5-3 1v10H6V12l-3-1 2-5h3a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2h4a2 2 0 0 0-2-2z"/></svg><span>Spind</span></button>
            <button class="lb-icon opensettings" aria-label="Einstellungen"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg><span>Einstellungen</span></button>
            <button class="lb-icon openhelp" aria-label="Steuerung"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M3 7h18a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm2 3v4h2v-4zm4 0v4h2v-4zm4 0v4h2v-4zm4 0v4h2v-4z"/></svg><span>Steuerung</span></button>
          </div>
        </div>
        <div class="lb-stage">
          <button class="lb-slot" aria-label="Freund einladen"><b>+</b><small>Einladen</small></button>
          <div class="lb-me"><div class="lb-podium"></div><canvas class="lb-pv" aria-label="Deine Figur"></canvas><div class="lb-name">Du</div></div>
          <button class="lb-slot" aria-label="Freund einladen"><b>+</b><small>Einladen</small></button>
        </div>
        <div class="lb-bottom">
          <div class="lb-left">
            <div class="daily"><b>Tägliche Aufgaben</b><div class="tasks"></div></div>
            <div class="stats"></div>
          </div>
          <div class="lb-play">
            <div class="seg modeseg" role="radiogroup" aria-label="Spielmodus">
              <button data-mode="solo">Solo</button><button data-mode="duo">Duo</button><button data-mode="squad">Squad</button>
            </div>
            <button class="btn pulse play">SPIELEN</button>
          </div>
        </div>
        <div class="help hidden">
          <b>PC:</b> WASD laufen  •  Maus zielen  •  Linksklick schießen  •  auf Gegenstände stellen zum Aufheben  •  Q Waffe wechseln  •  R nachladen  •  Tab große Karte<br>
          <b>Handy:</b> linker Stick laufen  •  rechter Stick zielen und schießen (in den Einstellungen tauschbar)  •  Minikarte antippen<br>
          Wähle deinen Landepunkt, öffne Kisten, Truhen und Versorgungspakete und bleib in der Zone
          <button class="btn secondary closehelp">OK</button>
        </div>
        <div class="hint portrait hidden">Tipp: Halte dein Handy quer, dann siehst du mehr vom Spielfeld</div>
      </div>`);
    this.over = $(`
      <div class="screen hidden" id="over">
        <div class="big"></div>
        <div class="subtitle osub"></div>
        <div class="subtitle ostats"></div>
        <div class="reward"></div>
        <div class="obtns">
          <button class="btn again">NOCHMAL</button>
          <button class="btn secondary watch">ZUSCHAUEN</button>
          <button class="btn secondary tomenu">MENÜ</button>
        </div>
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
              <div class="row"><span>Figur</span><div class="seg" data-lock="char"><button data-v="man">Mann</button><button data-v="woman">Frau</button><button data-v="jackal">Schakal</button><button data-v="luchador">Luchador</button></div></div>
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

    for (const k of ['alive', 'kills', 'zone', 'warn', 'feed', 'center', 'toast', 'prompt', 'wname', 'ammo', 'jump', 'reload', 'pickcard', 'buttons', 'gear', 'altslot', 'altname', 'tip', 'specbar', 'specname', 'killnote', 'team', 'downnote', 'bigmap', 'bighint', 'xhair', 'fire', 'dropsel', 'whiteflash']) {
      this.e[k] = this.hud.querySelector('.' + k)!;
    }
    this.e.arBar = this.hud.querySelector('.bar.ar i')!;
    this.e.hpBar = this.hud.querySelector('.bar.hp i')!;
    this.e.hpText = this.hud.querySelector('.bar.hp span')!;
    this.e.pcIcon = this.hud.querySelector('.pc-icon')!;
    this.e.pcName = this.hud.querySelector('.pc-name')!;
    this.e.pcStats = this.hud.querySelector('.pc-stats')!;
    this.mini = this.hud.querySelector('.mini')!;
    this.bigCanvas = this.hud.querySelector('.bigmap canvas')!;
    // Handy/Maus: auf die Minikarte tippen öffnet, auf die große Karte tippen schließt
    this.mini.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); this.setBig(true); });
    this.dropCanvas = this.hud.querySelector('.dropsel canvas')!;
    this.dropCanvas.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      const g = this.game;
      if (!g || g.player.phase !== 'plane') return;
      const rc = this.dropCanvas.getBoundingClientRect();
      g.chooseDrop(((ev.clientX - rc.left) / rc.width) * WORLD, ((ev.clientY - rc.top) / rc.height) * WORLD);
      this.sfx.ping();
    });
    this.e.dropsel.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    this.e.bigmap.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (!this.tabHeld) this.setBig(false); });
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
    this.menu.querySelector('.openhelp')!.addEventListener('click', () => this.menu.querySelector('.help')!.classList.remove('hidden'));
    this.menu.querySelector('.closehelp')!.addEventListener('click', () => this.menu.querySelector('.help')!.classList.add('hidden'));
    this.menu.querySelectorAll('.lb-slot').forEach((b) => b.addEventListener('click', () => this.notice('Online-Modus kommt bald: Dann kannst du hier Freunde einladen')));
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
    this.e.fire.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); this.fireHeld = true; this.e.fire.setPointerCapture(ev.pointerId); });
    const fireUp = () => { this.fireHeld = false; };
    this.e.fire.addEventListener('pointerup', fireUp);
    this.e.fire.addEventListener('pointercancel', fireUp);
    press(this.e.pickcard, 'pickup');

    window.addEventListener('keydown', (ev) => {
      this.keys.add(ev.code);
      if (ev.repeat) return;
      if (ev.code === 'Tab') { ev.preventDefault(); if (this.game) { this.tabHeld = true; this.setBig(true); } }
      if (ev.code === 'Space') { this.pending.jump = true; ev.preventDefault(); }
      if (ev.code === 'KeyR') this.pending.reload = true;
      if (ev.code === 'KeyE') this.pending.pickup = true;
      if (ev.code === 'KeyQ' || ev.code === 'Digit1' || ev.code === 'Digit2') this.pending.swap = true;
      if (ev.code === 'Escape' && this.game) this.paused ? this.closeSettings() : this.openSettings(true);
      if (ev.code === 'Enter' && !this.menu.classList.contains('hidden')) { startAudio(); this.cb.play(); }
    });
    window.addEventListener('keyup', (ev) => {
      this.keys.delete(ev.code);
      if (ev.code === 'Tab') { ev.preventDefault(); this.tabHeld = false; this.setBig(false); }
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });

    window.addEventListener('pointerdown', (ev) => {
      if (!this.game || this.paused) return;
      if ((ev.target as HTMLElement).closest('button, .screen, .mini, .bigmap')) return;
      this.touch = ev.pointerType !== 'mouse';
      if (ev.pointerType === 'mouse') {
        this.mouse.on = true;
        this.mouse.x = ev.clientX;
        this.mouse.y = ev.clientY;
        if (ev.button === 0) this.mouse.down = true;
        if (this.fppOn() && !document.pointerLockElement) {
          try { const r = (document.body as HTMLElement).requestPointerLock() as unknown as Promise<void> | undefined; r?.catch?.(() => {}); } catch { /* nicht verfügbar */ }
        }
        return;
      }
      this.mouse.on = false;
      const leftHalf = ev.clientX < window.innerWidth / 2;
      const moveLeft = !this.settings.swap;
      // Ich-Perspektive: auf der Blick-Seite wischen dreht die Kamera
      if (this.fppOn() && leftHalf !== moveLeft) {
        if (this.look.id === -1) this.look = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
        return;
      }
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
        if (this.fppOn() && !this.paused) this.turn(ev.movementX, ev.movementY, 0.0028);
        return;
      }
      if (ev.pointerId === this.look.id) {
        this.turn(ev.clientX - this.look.x, ev.clientY - this.look.y, 0.007);
        this.look.x = ev.clientX; this.look.y = ev.clientY;
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
      if (ev.pointerId === this.look.id) this.look.id = -1;
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
    if (!this.lobbyPv) this.lobbyPv = new Preview(this.menu.querySelector('.lb-pv') as HTMLCanvasElement, true);
    this.renderProfile();
    this.renderMode();
    this.lobbyPv.start();
    this.sfx.menuMusic(true);
  }

  /** nach dem Laden der Plüsch-Figuren Vorschau und Profilbild neu zeichnen */
  refreshLook() { this.renderProfile(); }

  get playerColor() { return skinColor(this.profile); }
  get playerLook() { return { char: this.profile.char, chute: this.profile.chute, outfit: this.profile.outfit, design: { ...this.profile.chuteDesign } }; }

  private openLocker() {
    this.menu.classList.add('hidden');
    this.lobbyPv?.stop();
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
    this.lobbyPv?.start();
  }

  private renderMode() {
    const m = this.settings.mode;
    this.menu.querySelectorAll<HTMLElement>('.modeseg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    this.menu.querySelector('.msub')!.textContent =
      m === 'solo' ? `${FIGHTER_COUNT} Kämpfer  •  Nur einer überlebt`
      : m === 'duo' ? '12 Teams à 2  •  Das letzte Team gewinnt'
      : '6 Teams à 4  •  Das letzte Team gewinnt';
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
    this.lobbyPv?.set(pr.char, skinColor(pr), pr.chute, false, pr.outfit, cd);
    (this.menu.querySelector('.lb-av') as HTMLImageElement).src = portrait(pr.char, skinColor(pr), 3, pr.outfit ?? 'none');
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
    this.wIconKey = '';
    this.lobbyPv?.stop();
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
    this.bigOpen = false;
    this.e.specbar.classList.add('hidden');
    this.tut = { step: this.profile.tutorialDone ? -1 : 0, t: 0 };
    this.lastStepPos = { x: game.player.x, y: game.player.y };
    this.miniBase = this.buildMiniBase(game, 320);
    this.bigBase = this.buildMiniBase(game, 1536);
    this.e.team.innerHTML = '';
    this.teamRows = [];
    // Profil: immer man selbst, dazu die Teamkameraden (Bild, Name, Leben und Schild)
    const mates = game.mode === 'solo' ? [] : game.teammates(game.player);
    this.e.team.classList.remove('hidden');
    for (const m of [game.player, ...mates]) {
      const row = $(`<div class="tm"><img class="tm-av" alt=""><div class="tm-info"><span class="tm-n"></span><div class="tm-bar ar"><i></i></div><div class="tm-bar"><i></i></div></div></div>`);
      if (m.isPlayer) row.classList.add('me');
      row.querySelector('.tm-n')!.textContent = m.isPlayer ? 'Du' : m.name;
      const img = row.querySelector('img') as HTMLImageElement;
      img.src = portrait(m.look.char, m.color, m.id * 7 + 3, m.look.outfit ?? 'none');
      this.e.team.append(row);
      const bars = row.querySelectorAll('.tm-bar i');
      this.teamRows.push({ f: m, row, bar: bars[1] as HTMLElement, ar: bars[0] as HTMLElement });
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
    const fpp = this.fppOn();
    if (fpp && !this.fppWas) { this.fppYaw = game.player.aim; this.fppPitch = -0.05; }
    this.fppWas = fpp;
    game.input.fpp = fpp;
    if (fpp) {
      // WASD / Stick relativ zur Blickrichtung (W = vorwärts)
      const fx = Math.cos(this.fppYaw), fy = Math.sin(this.fppYaw);
      const fwd = -my, side = mx;
      mx = fx * fwd - fy * side;
      my = fy * fwd + fx * side;
    }
    game.input.mx = mx;
    game.input.my = my;
    // Aufheben überall gleich: kurz auf dem Gegenstand stehen bleiben
    game.input.autoWeapon = true;

    game.input.aim = null;
    game.input.firing = false;
    const p = game.player;
    if (fpp) {
      game.input.aim = this.fppYaw;
      game.input.firing = this.mouse.down || this.fireHeld;
    } else if (this.aim.active) {
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
          if (ev.f === p) {
            this.sfx.dropWhoosh();
            // weißer Blitz, dann blendet er weich aus
            const wf = this.e.whiteflash;
            wf.style.opacity = '';
            (this.e.dropsel.querySelector('.ds-map') as HTMLElement).style.transform = '';
            wf.classList.remove('fade');
            wf.classList.add('on');
            void wf.offsetWidth;
            wf.classList.add('fade');
            wf.classList.remove('on');
          }
          break;
        case 'chute':
          if (ev.f === p) this.sfx.chuteOpen();
          break;
        case 'kill': {
          const color = ev.me ? '#ff6b6b' : ev.mine ? '#ffd23f' : '#ffffff';
          const txt = ev.killer === 'Zone' ? `${ev.victim} von der Zone erwischt` : ev.killer === 'Selbst' ? `${ev.victim} von der eigenen Explosion erwischt` : `${ev.killer} → ${ev.victim} (${ev.weapon})`;
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
    // Treffer-Kreuze sind auf Wunsch abgeschaltet (Treffer hört man am Ton)
    if (HIT_MARKS) this.drawHitMark(r, x, y, kill);
  }

  private drawHitMark(r: Renderer, x: number, y: number, kill: boolean) {
    const s = r.project(x, y, 1.2);
    if (!s.on) return;
    const el = document.createElement('div');
    el.className = 'hitmark' + (kill ? ' kill' : '');
    el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    this.labelsLayer.append(el);
    setTimeout(() => el.remove(), kill ? 600 : 260);
  }

  /** Ich-Perspektive gerade aktiv (am Boden, am Leben) */
  fppOn() {
    const g = this.game;
    return !!g && this.settings.view === 'fpp' && g.player.alive && g.player.phase === 'ground' && !g.over;
  }

  private turn(dx: number, dy: number, k: number) {
    this.fppYaw += dx * k;
    this.fppPitch = Math.max(-0.6, Math.min(0.35, this.fppPitch - dy * k));
  }

  setBig(on: boolean) {
    this.bigOpen = on && !!this.game;
    this.e.bigmap.classList.toggle('hidden', !this.bigOpen);
    this.e.bighint.textContent = this.touch ? 'Tippen zum Schließen' : 'Tab loslassen zum Schließen';
    if (this.bigOpen && this.game) this.drawMini(this.game, this.bigCanvas, this.bigBase, 1536);
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
    // in der Ich-Perspektive relativ zur Blickrichtung (oben = vorne)
    el.style.transform = `rotate(${this.fppOn() ? angle - this.fppYaw : angle + Math.PI / 2}rad)`;
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
    const fppNow = this.fppOn();
    this.e.xhair.classList.toggle('hidden', !fppNow || p.downed);
    this.e.fire.classList.toggle('hidden', !fppNow || !this.touch || p.downed);
    if (!fppNow && document.pointerLockElement) document.exitPointerLock();
    // Schritte, Zonenwarnung, Flugzeug, Nachladen
    if (p.alive && p.phase === 'ground') {
      this.stepDist += Math.hypot(p.x - this.lastStepPos.x, p.y - this.lastStepPos.y);
      if (this.stepDist > 70) { this.stepDist = 0; this.sfx.step(); }
    }
    this.lastStepPos = { x: p.x, y: p.y };
    if (game.playerOutside() && game.time > this.zoneBeep) { this.zoneBeep = game.time + 1000; this.sfx.zoneWarn(); }
    this.sfx.wind(p.alive && p.phase === 'fall' ? (p.z > CHUTE_Z ? 1 : 0.28) : 0, p.phase === 'fall' && p.z > CHUTE_Z ? 1 : 0.1);
    if (p.reloading && !this.wasReloading) this.sfx.reload();
    this.wasReloading = p.reloading;
    // zweiter Waffenplatz
    this.e.altslot.classList.add('hidden');
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
      t.ar.style.width = `${f.alive && !f.downed ? f.armor : 0}%`;
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
    // Waffe als Bild in Seltenheitsfarbe; Fäuste als Text
    const wkey = p.weapon.id + p.weapon.tier;
    if (wkey !== this.wIconKey) {
      this.wIconKey = wkey;
      const img = this.hud.querySelector('.wicon') as HTMLImageElement;
      const fists = p.weapon.id === 'fists';
      img.src = fists ? '' : gunIcon(p.weapon.id, p.weapon.tier);
      img.alt = p.weapon.name;
      img.classList.toggle('hidden', fists);
      this.e.wname.textContent = fists ? p.weapon.name : '';
      (this.hud.querySelector('.wslot') as HTMLElement).style.setProperty('--tc', hex(TIER_COLORS[p.weapon.tier]));
      this.hud.querySelector('.wslot')!.classList.toggle('gun', !fists);
    }
    this.e.ammo.textContent = p.weapon.id === 'fists' ? 'Nahkampf' : p.reloading ? 'Lädt…' : `${p.mag} / ${p.ammo}`;
    this.e.hpBar.style.width = `${Math.max(0, p.hp)}%`;
    this.e.hpBar.style.background = p.hp > 50 ? '' : p.hp > 25 ? '#ffcc00' : '#ff3b30';
    this.e.hpText.textContent = String(Math.ceil(Math.max(0, p.hp)));
    this.e.arBar.style.width = `${p.armor}%`;

    const inPlane = p.phase === 'plane';
    const ground = p.phase === 'ground' && p.alive && !game.over;
    this.e.jump.classList.add('hidden');
    this.e.dropsel.classList.toggle('hidden', !inPlane || !p.alive);
    if (inPlane) this.updateDropSel(game);
    this.e.buttons.classList.toggle('hidden', !ground || p.downed || p.weapon.id === 'fists');

    // Aufheben-Karte für Waffen
    const nw = null as typeof game.nearbyWeapon;
    this.e.pickcard.classList.toggle('hidden', !nw);
    if (nw) {
      const w = parseWeapon(nw.kind);
      const col = hex(TIER_COLORS[w.tier]);
      this.e.pickcard.style.borderColor = col;
      this.e.pcIcon.style.background = col;
      this.e.pcName.textContent = `${w.name} · ${RARITY_NAMES[w.tier]}`;
      this.e.pcStats.textContent = `Schaden ${w.damage * w.pellets}  •  Reichweite ${Math.round(w.range / 10)} m  •  Magazin ${w.mag}`;
    }
    this.e.prompt.textContent = p.phase === 'fall' ? (p.z > CHUTE_Z ? '' : 'Lenk deinen Fallschirm zum Landeplatz') : '';
    this.e.center.textContent = '';

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

    // große Karte jedes Bild, damit Pfeil und Sturm flüssig laufen; Minikarte reicht 10x pro Sekunde
    if (this.bigOpen) this.drawMini(game, this.bigCanvas, this.bigBase, 1536);
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
      { text: t ? 'Tippe auf die Karte, um zu wählen, wo du landest' : 'Klick auf die Karte, um zu wählen, wo du landest', until: () => p.phase !== 'plane' },
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

  /** Landepunkt-Auswahl: Karte mit Zone, eigenem Pfeil und den Punkten der Mitspieler, daneben der Countdown */
  private updateDropSel(game: Game) {
    const left = game.dropLeft();
    const sec = Math.ceil(left);
    this.e.dropsel.querySelector('.ds-num')!.textContent = String(sec);
    const fg = this.e.dropsel.querySelector('.ds-timer .fg') as SVGCircleElement;
    const C = 2 * Math.PI * 52;
    fg.style.strokeDasharray = `${C}`;
    fg.style.strokeDashoffset = `${C * (1 - left / (PLANE_TIME / 1000))}`;
    this.e.dropsel.classList.toggle('urgent', sec <= 5);
    // Übergang: in den letzten 0,7 s zoomt die Karte auf den Landepunkt und es wird weiß
    const map = this.e.dropsel.querySelector('.ds-map') as HTMLElement;
    const tr = Math.max(0, Math.min(1, (0.7 - left) / 0.7));
    const pick = game.dropPick;
    if (tr > 0) {
      const ox = pick ? (pick.x / WORLD) * 100 : 50, oy = pick ? (pick.y / WORLD) * 100 : 50;
      map.style.transformOrigin = `${ox}% ${oy}%`;
      map.style.transform = `scale(${1 + tr * tr * 2.6})`;
      this.e.whiteflash.style.opacity = String(tr * tr);
      (this.e.dropsel.querySelector('.ds-side') as HTMLElement).style.opacity = String(1 - tr * 2);
    } else if (map.style.transform) {
      (this.e.dropsel.querySelector('.ds-side') as HTMLElement).style.opacity = '';
      map.style.transform = '';
      this.e.whiteflash.style.opacity = '';
    }
    if (sec !== this.lastTick) { this.lastTick = sec; if (sec <= 5 && sec > 0) this.sfx.tick(sec <= 3); }
    this.e.dropsel.querySelector('.ds-hint')!.textContent = game.dropPick
      ? 'Landepunkt gesetzt. Du kannst ihn noch ändern'
      : this.touch ? 'Tippe auf die Karte' : 'Klick auf die Karte';
    const N = 1536, q = N / 320, k = N / WORLD;
    const cv = this.dropCanvas, g = cv.getContext('2d')!;
    if (this.bigBase) g.drawImage(this.bigBase, 0, 0);
    // erste Zone
    const zc = game.zoneCur;
    g.strokeStyle = '#b9a8ff'; g.lineWidth = 2.5 * q;
    g.beginPath(); g.arc(zc.x * k, zc.y * k, zc.r * k, 0, 7); g.stroke();
    const now = performance.now();
    const team = game.mode === 'solo' ? [] : game.teammates(game.player);
    const pins: { x: number; y: number; color: string; name: string; me: boolean }[] = [];
    for (const m of team) if (m.alive) pins.push({ x: m.landX, y: m.landY, color: hex(m.color), name: m.name, me: false });
    if (game.dropPick) pins.push({ x: game.dropPick.x, y: game.dropPick.y, color: hex(game.player.color), name: 'Du', me: true });
    for (const pn of pins) {
      const x = pn.x * k, y = pn.y * k, s = (pn.me ? 9 : 7) * q;
      if (pn.me) {
        const t = (now % 1400) / 1400;
        g.strokeStyle = `rgba(255,255,255,${0.9 * (1 - t)})`; g.lineWidth = 2 * q;
        g.beginPath(); g.ellipse(x, y, (4 + t * 16) * q, (2 + t * 8) * q, 0, 0, 7); g.stroke();
      }
      // Schatten am Boden
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(x, y, s * 0.55, s * 0.25, 0, 0, 7); g.fill();
      // Standort-Nadel in der Spielerfarbe (Tropfenform, Spitze auf dem Punkt), leicht hüpfend
      const bob = Math.sin(now / 260 + pn.x) * 1.5 * q;
      this.pin(g, x, y + bob * 0.3 - 0.5 * q, s * 1.05, pn.color, bob);
      g.font = `900 ${(pn.me ? 10 : 8) * q}px Nunito, system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.lineWidth = 3 * q; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.fillStyle = '#fff';
      g.strokeText(pn.name, x, y - s * 2.45 + bob); g.fillText(pn.name, x, y - s * 2.45 + bob);
    }
    // Teamliste neben dem Countdown
    const tl = this.e.dropsel.querySelector('.ds-team')!;
    const html = team.length
      ? team.map((m) => `<div><i style="background:${hex(m.color)}"></i>${m.name}</div>`).join('')
      : '';
    if (tl.innerHTML !== html) tl.innerHTML = html;
  }

  private buildMiniBase(game: Game, N = 320) {
    const q = N / 320;
    const big = N > 400;
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d')!;
    const k = N / WORLD;
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Meer
    if (big) {
      const sea = g.createRadialGradient(N / 2, N / 2, N * 0.3, N / 2, N / 2, N * 0.75);
      sea.addColorStop(0, '#3fb6e0'); sea.addColorStop(1, '#1d6fa8');
      g.fillStyle = sea;
      g.fillRect(0, 0, N, N);
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1.4 * q;
      for (let i = 0; i < 70; i++) {
        const x = rnd() * N, y = rnd() * N, w = (6 + rnd() * 8) * q;
        g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y - 2.5 * q, x + w, y); g.stroke();
      }
      // Strand mit weichem Übergang ins Wasser
      g.save();
      g.shadowColor = 'rgba(160,235,255,0.9)'; g.shadowBlur = 10 * q;
      g.fillStyle = '#f1dc9f';
      g.beginPath(); g.roundRect(3 * q, 3 * q, N - 6 * q, N - 6 * q, 20 * q); g.fill();
      g.restore();
    } else {
      g.fillStyle = '#ecd59a';
      g.fillRect(0, 0, N, N);
    }
    // Gras
    if (big) {
      const gr = g.createLinearGradient(0, 0, N, N);
      gr.addColorStop(0, '#93d264'); gr.addColorStop(1, '#74b84c');
      g.fillStyle = gr;
    } else g.fillStyle = '#86c95a';
    g.beginPath();
    g.roundRect(6 * q, 6 * q, N - 12 * q, N - 12 * q, 16 * q);
    g.fill();
    if (big) {
      g.save(); g.clip();
      for (let i = 0; i < 900; i++) {
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(30,80,20,0.06)';
        g.beginPath(); g.arc(rnd() * N, rnd() * N, (2 + rnd() * 5) * q, 0, 7); g.fill();
      }
      g.restore();
    }
    g.fillStyle = big ? 'rgba(52,120,40,0.45)' : 'rgba(70,140,50,0.55)';
    for (const f of game.map.forests) { g.beginPath(); g.arc(f.x * k, f.y * k, f.r * k, 0, 7); g.fill(); }
    g.fillStyle = '#e6c86e';
    for (const f of game.map.fields) {
      g.fillRect((f.x - f.w / 2) * k, (f.y - f.h / 2) * k, f.w * k, f.h * k);
      if (big) {
        g.strokeStyle = 'rgba(160,120,40,0.35)'; g.lineWidth = 1 * q;
        for (let x = f.x - f.w / 2 + 30; x < f.x + f.w / 2; x += 45) {
          g.beginPath(); g.moveTo(x * k, (f.y - f.h / 2) * k); g.lineTo(x * k, (f.y + f.h / 2) * k); g.stroke();
        }
      }
    }
    const rv = game.map.river;
    const riverPath = () => { g.beginPath(); rv.pts.forEach((pt, i) => (i ? g.lineTo(pt.x * k, pt.y * k) : g.moveTo(pt.x * k, pt.y * k))); };
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (big) {
      g.strokeStyle = '#d9c483'; g.lineWidth = rv.width * k + 5 * q; riverPath(); g.stroke();
      g.strokeStyle = '#2f93cf'; g.lineWidth = rv.width * k; riverPath(); g.stroke();
      g.strokeStyle = 'rgba(160,225,255,0.55)'; g.lineWidth = rv.width * k * 0.35; riverPath(); g.stroke();
    } else {
      g.strokeStyle = '#3aa6dc'; g.lineWidth = rv.width * k; riverPath(); g.stroke();
    }
    for (const p of game.map.ponds) {
      if (big) { g.fillStyle = '#d9c483'; g.beginPath(); g.arc(p.x * k, p.y * k, p.r * k + 2.5 * q, 0, 7); g.fill(); }
      g.fillStyle = big ? '#2f93cf' : '#3aa6dc'; g.beginPath(); g.arc(p.x * k, p.y * k, p.r * k, 0, 7); g.fill();
      if (big) { g.fillStyle = 'rgba(160,225,255,0.4)'; g.beginPath(); g.arc(p.x * k - p.r * k * 0.25, p.y * k - p.r * k * 0.25, p.r * k * 0.45, 0, 7); g.fill(); }
    }
    for (const b of rv.bridges) {
      g.save();
      g.translate(b.x * k, b.y * k);
      g.rotate(b.angle);
      const L = (rv.width + 150) * k, W = (big ? 7 : 8) * q;
      if (big) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-W / 2 + 1.5 * q, -L / 2 + 1.5 * q, W, L); }
      g.fillStyle = '#b07c48'; g.fillRect(-W / 2, -L / 2, W, L);
      if (big) {
        g.strokeStyle = '#7a5130'; g.lineWidth = 1 * q;
        for (let y = -L / 2 + 3 * q; y < L / 2; y += 3 * q) { g.beginPath(); g.moveTo(-W / 2, y); g.lineTo(W / 2, y); g.stroke(); }
      }
      g.restore();
    }
    for (const o of game.map.obstacles) {
      if (o.kind === 'rock') {
        const r = Math.max(1.5 * q, o.r * k);
        g.fillStyle = '#8e949c'; g.beginPath(); g.arc(o.x * k, o.y * k, r, 0, 7); g.fill();
        if (big) { g.fillStyle = '#b9bec5'; g.beginPath(); g.arc(o.x * k - r * 0.3, o.y * k - r * 0.3, r * 0.5, 0, 7); g.fill(); }
      } else if (big && (o.kind === 'tree' || o.kind === 'bush')) {
        const r = Math.max(2.2 * q, o.r * k * (o.kind === 'tree' ? 2.6 : 1.1));
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.arc(o.x * k + r * 0.3, o.y * k + r * 0.3, r, 0, 7); g.fill();
        g.fillStyle = o.kind === 'tree' ? '#2f7d33' : '#4f9f3c'; g.beginPath(); g.arc(o.x * k, o.y * k, r, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(o.x * k - r * 0.3, o.y * k - r * 0.3, r * 0.45, 0, 7); g.fill();
      }
    }
    for (const h of game.houses) {
      const x = (h.x - h.s / 2) * k, y = (h.y - h.s / 2) * k, s = h.s * k;
      if (big) {
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 3 * q, y + 3 * q, s, s);
        g.fillStyle = '#d0644a'; g.fillRect(x, y, s, s);
        // Dachfirst: zwei Dachhälften
        g.fillStyle = '#a9452f'; g.fillRect(x, y + s / 2, s, s / 2);
        g.strokeStyle = '#7a2e1f'; g.lineWidth = 1.5 * q; g.strokeRect(x, y, s, s);
        g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(x + 1 * q, y + s / 2); g.lineTo(x + s - 1 * q, y + s / 2); g.stroke();
      } else {
        g.fillStyle = '#c0573e';
        g.fillRect(x, y, s, s);
      }
    }
    if (big) {
      // Planquadrate A-H / 1-8
      const n = 8, step = N / n;
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1 * q;
      for (let i = 1; i < n; i++) {
        g.beginPath(); g.moveTo(i * step, 0); g.lineTo(i * step, N); g.stroke();
        g.beginPath(); g.moveTo(0, i * step); g.lineTo(N, i * step); g.stroke();
      }
      g.font = `900 ${11 * q}px Nunito, system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 3 * q; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < n; i++) {
        const L = 'ABCDEFGH'[i];
        g.strokeText(L, (i + 0.5) * step, 9 * q); g.fillText(L, (i + 0.5) * step, 9 * q);
        g.strokeText(String(i + 1), 9 * q, (i + 0.5) * step); g.fillText(String(i + 1), 9 * q, (i + 0.5) * step);
      }
    }
    return c;
  }

  /** Standort-Nadel: Kopf mit weißem Punkt, Spitze zeigt auf (x, y) */
  private pin(g: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string, bob: number) {
    const r = s * 0.62, cy = y - s * 1.55 + bob;
    const path = () => {
      g.beginPath();
      g.moveTo(x, y);
      g.bezierCurveTo(x - r * 0.35, y - s * 0.55, x - r, cy + r * 0.55, x - r, cy);
      g.arc(x, cy, r, Math.PI, 0);
      g.bezierCurveTo(x + r, cy + r * 0.55, x + r * 0.35, y - s * 0.55, x, y);
      g.closePath();
    };
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = s * 0.4; g.shadowOffsetY = s * 0.1;
    path(); g.fillStyle = '#fff'; g.fill();
    g.restore();
    g.save();
    g.lineJoin = 'round'; g.lineWidth = s * 0.28; g.strokeStyle = '#fff'; path(); g.stroke();
    const grd = g.createLinearGradient(0, cy - r, 0, y);
    grd.addColorStop(0, fill); grd.addColorStop(1, shade(fill));
    path(); g.fillStyle = grd; g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(x, cy, r * 0.42, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  /** Spieler-Pfeil (Navigationspfeil) mit weißem Rand und Schatten */
  private arrow(g: CanvasRenderingContext2D, x: number, y: number, a: number, s: number, fill: string) {
    g.save();
    g.translate(x, y);
    g.rotate(a + Math.PI / 2);
    const path = () => {
      g.beginPath();
      g.moveTo(0, -s * 1.15);
      g.lineTo(s * 0.8, s * 0.8);
      g.lineTo(0, s * 0.38);
      g.lineTo(-s * 0.8, s * 0.8);
      g.closePath();
    };
    g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = s * 0.6; g.shadowOffsetY = s * 0.15;
    path(); g.fillStyle = '#ffffff'; g.fill();
    g.shadowColor = 'transparent';
    g.lineJoin = 'round'; g.lineWidth = s * 0.32; g.strokeStyle = '#ffffff'; path(); g.stroke();
    const grd = g.createLinearGradient(0, -s, 0, s);
    grd.addColorStop(0, fill); grd.addColorStop(1, shade(fill));
    path(); g.fillStyle = grd; g.fill();
    g.restore();
  }

  private drawMini(game: Game, cv: HTMLCanvasElement = this.mini, base = this.miniBase, N = 320) {
    const g = cv.getContext('2d')!;
    const k = N / WORLD, q = N / 320;
    const big = N > 400;
    const now = performance.now();
    if (base) g.drawImage(base, 0, 0);
    for (const o of game.obstacles) {
      if (!isContainer(o) || o.opened) continue;
      const col = o.kind === 'crate' ? '#ffd54a' : o.kind === 'chest' ? '#ffc93c' : '#ff8a1e';
      const s = (o.kind === 'crate' ? 3 : 5) * q * (big ? 0.8 : 1);
      if (big) {
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(o.x * k - s / 2 - 0.8 * q, o.y * k - s / 2 - 0.8 * q, s + 1.6 * q, s + 1.6 * q);
      }
      g.fillStyle = col;
      g.fillRect(o.x * k - s / 2, o.y * k - s / 2, s, s);
    }
    for (const d of game.airdrops) {
      if (d.obstacle) continue;
      g.strokeStyle = '#ff8a1e';
      g.lineWidth = 2 * q;
      g.beginPath(); g.arc(d.x * k, d.y * k, (7 + Math.sin(now / 150) * 2) * q, 0, 7); g.stroke();
    }
    if (false as boolean) {
      const pl = game.plane;
      g.strokeStyle = 'rgba(255,255,255,0.75)';
      g.setLineDash([8 * q, 6 * q]);
      g.lineWidth = 2 * q;
      g.beginPath(); g.moveTo(pl.x1 * k, pl.y1 * k); g.lineTo(pl.x2 * k, pl.y2 * k); g.stroke();
      g.setLineDash([]);
    }
    const zc = game.zoneCur, zn = game.zoneNext;
    g.save();
    g.beginPath();
    g.rect(0, 0, N, N);
    g.arc(zc.x * k, zc.y * k, Math.max(0, zc.r * k), 0, Math.PI * 2, true);
    g.fillStyle = big ? 'rgba(70,40,190,0.38)' : 'rgba(40,72,200,0.35)';
    g.fill('evenodd');
    if (big) {
      // Sturm außerhalb der Zone: wandernde Schlieren und Wirbel, damit man die Bewegung sieht
      g.clip('evenodd');
      const off = ((now / 1000) * 18 * q) % (14 * q);
      g.strokeStyle = 'rgba(210,190,255,0.13)'; g.lineWidth = 3 * q;
      for (let i = -N; i < N + 14 * q; i += 14 * q) { g.beginPath(); g.moveTo(i + off, 0); g.lineTo(i + off + N, N); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 2 * q;
      for (let i = 0; i < 9; i++) {
        const a = now / 2600 + i * 0.7, rr = zc.r * k + (18 + (i % 3) * 22) * q;
        g.beginPath(); g.arc(zc.x * k, zc.y * k, rr, a, a + 0.9); g.stroke();
      }
    }
    g.restore();
    if (big) { g.save(); g.shadowColor = '#b9a8ff'; g.shadowBlur = (8 + Math.sin(now / 250) * 4) * q; }
    g.strokeStyle = big ? '#b9a8ff' : '#7fb2ff'; g.lineWidth = (big ? 2.5 : 3) * q;
    g.beginPath(); g.arc(zc.x * k, zc.y * k, Math.max(0, zc.r * k), 0, 7); g.stroke();
    if (big) g.restore();
    if (game.zoneState !== 'done' && zn.r > 0) {
      g.strokeStyle = '#ffffff'; g.lineWidth = (big ? 1.6 : 2) * q;
      if (big) g.setLineDash([6 * q, 4 * q]);
      g.beginPath(); g.arc(zn.x * k, zn.y * k, zn.r * k, 0, 7); g.stroke();
      g.setLineDash([]);
    }
    const p = game.player;
    if (big && p.alive && p.phase !== 'plane') {
      // gestrichelte Linie zur nächsten Zone, wenn man draußen ist
      if (game.zoneState !== 'done' && zn.r > 0 && Math.hypot(p.x - zn.x, p.y - zn.y) > zn.r) {
        const a = Math.atan2(zn.y - p.y, zn.x - p.x);
        const ex = zn.x - Math.cos(a) * zn.r, ey = zn.y - Math.sin(a) * zn.r;
        g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5 * q; g.setLineDash([3 * q, 3 * q]);
        g.beginPath(); g.moveTo(p.x * k, p.y * k); g.lineTo(ex * k, ey * k); g.stroke(); g.setLineDash([]);
      }
    }
    if (game.mode !== 'solo') {
      for (const m of game.teammates(p)) {
        if (!m.alive) continue;
        if (m.phase === 'plane') continue;
        const pos = m;
        if (big) {
          this.arrow(g, pos.x * k, pos.y * k, m.aim, 5.5 * q, '#5ab4ff');
        } else {
          g.fillStyle = '#4aa8ff'; g.strokeStyle = '#000'; g.lineWidth = 2 * q;
          g.beginPath(); g.arc(pos.x * k, pos.y * k, 5 * q, 0, 7); g.fill(); g.stroke();
        }
      }
    }
    if (p.alive && p.phase !== 'plane') {
      const pos = p;
      if (big) {
        const x = pos.x * k, y = pos.y * k;
        {
          // Sichtkegel
          const cone = g.createRadialGradient(x, y, 0, x, y, 34 * q);
          cone.addColorStop(0, 'rgba(255,230,120,0.55)'); cone.addColorStop(1, 'rgba(255,230,120,0)');
          g.fillStyle = cone;
          g.beginPath(); g.moveTo(x, y); g.arc(x, y, 34 * q, p.aim - 0.5, p.aim + 0.5); g.closePath(); g.fill();
        }
        // pulsierender Ring
        const t = (now % 1600) / 1600;
        g.strokeStyle = `rgba(255,210,63,${0.8 * (1 - t)})`; g.lineWidth = 2 * q;
        g.beginPath(); g.arc(x, y, (6 + t * 14) * q, 0, 7); g.stroke();
        this.arrow(g, x, y, p.aim, 7 * q, '#ffd23f');
      } else {
        g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 2 * q;
        g.beginPath(); g.arc(pos.x * k, pos.y * k, 6 * q, 0, 7); g.fill(); g.stroke();
      }
    }
  }
}

/** Farbe etwas abdunkeln (für Verlauf im Pfeil) */
function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * 0.72);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
