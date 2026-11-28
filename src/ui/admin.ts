import * as THREE from 'three';
import { S, WORLD } from '../config';
import type { MapData } from '../mapgen';

/**
 * Admin-Bereich (nur lokal freigeschaltet): Freiflug mit No-Clip durch die feste Karte,
 * ohne Runde, ohne Bots, ohne Ladezeit. Zeigt Position, Kartenfeld und Ort an,
 * damit man Stellen genau beschreiben kann.
 */
const KEY = 'zonerush.admin.v1';
const COLS = 'ABCDEFGHIJ';

export class Admin {
  flying = false;
  private pos = new THREE.Vector3();
  private yaw = 0;
  private pitch = -0.25;
  private speed = 1;
  private keys = new Set<string>();
  private locked = false;
  private ui!: HTMLElement;
  private panel!: HTMLElement;
  private info!: HTMLElement;
  private tp!: HTMLElement;
  private btn!: HTMLElement;
  private touch = { look: null as null | { id: number; x: number; y: number }, fwd: 0, up: 0 };
  private lastInfo = 0;

  constructor(private getMap: () => MapData | null, private canvas: () => HTMLCanvasElement, private onEnter: () => void, private onExit: () => void) {
    this.build();
    // Freischalten: 5x schnell auf das Logo in der Lobby tippen (bleibt in diesem Browser gespeichert)
    let taps: number[] = [];
    document.addEventListener('click', (ev) => {
      const logo = (ev.target as HTMLElement).closest?.('.lb-logo');
      if (!logo) return;
      const now = performance.now();
      taps = taps.filter((t) => now - t < 4000);
      taps.push(now);
      if (taps.length >= 5) {
        taps = [];
        const on = !this.unlocked();
        try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { /* ignorieren */ }
        this.refreshButton();
        this.toast(on ? 'Admin freigeschaltet' : 'Admin ausgeblendet');
      }
    });
    this.refreshButton();
  }

  private unlocked() {
    try { return localStorage.getItem(KEY) === '1' || location.hash.includes('admin'); } catch { return location.hash.includes('admin'); }
  }

  private refreshButton() {
    const host = document.querySelector('#menu .lb-actions');
    if (host && !host.contains(this.btn)) host.prepend(this.btn);
    this.btn.classList.toggle('hidden', !this.unlocked());
  }

  private toast(t: string) {
    const d = document.createElement('div');
    d.className = 'adm-toast';
    d.textContent = t;
    document.body.append(d);
    setTimeout(() => d.remove(), 1800);
  }

  private build() {
    const $ = (h: string) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild as HTMLElement; };
    this.btn = $(`<button class="lb-icon adm-open hidden" aria-label="Admin"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5zm0 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm0 8c2 0 4 1 4.5 2.2A7.9 7.9 0 0 1 12 20.8a7.9 7.9 0 0 1-4.5-3.6C8 16 10 15 12 15z"/></svg><span>Admin</span></button>`);
    this.btn.addEventListener('click', () => this.panel.classList.remove('hidden'));

    this.panel = $(`
      <div class="adm-panel hidden">
        <div class="adm-box">
          <h2>Admin</h2>
          <button class="btn adm-fly">FREIFLUG (NO-CLIP)</button>
          <p>Ohne Runde, ohne Bots, sofort in der Karte. Frei durch Wände, Häuser und Boden fliegen.</p>
          <button class="btn secondary adm-close">SCHLIESSEN</button>
        </div>
      </div>`);
    this.panel.querySelector('.adm-close')!.addEventListener('click', () => this.panel.classList.add('hidden'));
    this.panel.querySelector('.adm-fly')!.addEventListener('click', () => { this.panel.classList.add('hidden'); this.start(); });

    this.ui = $(`
      <div class="adm-fly-ui hidden">
        <div class="adm-info"></div>
        <div class="adm-help">Klick ins Bild = Maus steuern • WASD fliegen • Leertaste hoch • C / Strg runter • Shift = schnell • Mausrad = Tempo • T = Orte • Esc = Maus frei</div>
        <div class="adm-top">
          <button class="adm-b adm-copy">Position kopieren</button>
          <button class="adm-b adm-tpbtn">Orte</button>
          <button class="adm-b adm-exit">Beenden</button>
        </div>
        <div class="adm-tp hidden"></div>
        <div class="adm-cross"></div>
        <div class="adm-touch">
          <button class="adm-t" data-a="fwd">▲</button><button class="adm-t" data-a="back">▼</button>
          <button class="adm-t" data-a="up">Hoch</button><button class="adm-t" data-a="down">Runter</button>
        </div>
      </div>`);
    this.info = this.ui.querySelector('.adm-info')!;
    this.tp = this.ui.querySelector('.adm-tp')!;
    this.ui.querySelector('.adm-exit')!.addEventListener('click', () => this.stop());
    this.ui.querySelector('.adm-tpbtn')!.addEventListener('click', () => this.toggleTp());
    this.ui.querySelector('.adm-copy')!.addEventListener('click', () => this.copy());
    document.body.append(this.panel, this.ui);

    // Touch-Knöpfe (Handy/Tablet)
    for (const b of Array.from(this.ui.querySelectorAll<HTMLElement>('.adm-t'))) {
      const a = b.dataset.a!;
      const set = (v: number) => {
        if (a === 'fwd') this.touch.fwd = v; if (a === 'back') this.touch.fwd = -v;
        if (a === 'up') this.touch.up = v; if (a === 'down') this.touch.up = -v;
      };
      b.addEventListener('pointerdown', (e: PointerEvent) => { e.stopPropagation(); set(1); });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => set(0));
    }

    // Tastatur: im Freiflug vor allen anderen Handlern abfangen
    window.addEventListener('keydown', (e) => {
      if (!this.flying) return;
      e.stopImmediatePropagation();
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'KeyT') this.toggleTp();
      if (e.code === 'Escape' && !this.locked) this.stop();
    }, true);
    window.addEventListener('keyup', (e) => { if (this.flying) { e.stopImmediatePropagation(); this.keys.delete(e.code); } }, true);
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('wheel', (e) => {
      if (!this.flying) return;
      this.speed = Math.min(16, Math.max(0.125, this.speed * (e.deltaY > 0 ? 0.8 : 1.25)));
    }, { passive: true });

    // Maus: Zeiger fangen zum Umschauen
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === this.canvas(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.flying || !this.locked) return;
      this.look(e.movementX, e.movementY);
    });
    this.ui.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button, .adm-tp')) return;
      if (e.pointerType === 'mouse') { this.canvas().requestPointerLock?.(); return; }
      this.touch.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    this.ui.addEventListener('pointermove', (e) => {
      const t = this.touch.look;
      if (!t || t.id !== e.pointerId) return;
      this.look((e.clientX - t.x) * 1.6, (e.clientY - t.y) * 1.6);
      t.x = e.clientX; t.y = e.clientY;
    });
    const endLook = (e: PointerEvent) => { if (this.touch.look?.id === e.pointerId) this.touch.look = null; };
    this.ui.addEventListener('pointerup', endLook);
    this.ui.addEventListener('pointercancel', endLook);
  }

  private look(dx: number, dy: number) {
    this.yaw += dx * 0.0025;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - dy * 0.0025));
  }

  private toggleTp() {
    const m = this.getMap();
    if (!m) return;
    if (!this.tp.childElementCount) {
      const spots = [...m.pois].sort((a, b) => a.name.localeCompare(b.name));
      for (const p of spots) {
        const b = document.createElement('button');
        b.className = 'adm-b';
        b.textContent = p.name;
        b.addEventListener('click', () => this.goto(p.x, p.y + p.r * 0.9 + 150, 14, -Math.PI / 2, -0.45));
        this.tp.append(b);
      }
      const all = document.createElement('button');
      all.className = 'adm-b';
      all.textContent = 'Ganze Insel (von oben)';
      all.addEventListener('click', () => this.goto(WORLD / 2, WORLD * 0.86, 230, -Math.PI / 2, -0.95));
      this.tp.prepend(all);
    }
    this.tp.classList.toggle('hidden');
  }

  goto(x: number, y: number, h: number, yaw: number, pitch: number) {
    this.pos.set(x * S, h, y * S);
    this.yaw = yaw;
    this.pitch = pitch;
    this.tp.classList.add('hidden');
  }

  private where() {
    const m = this.getMap();
    const x = this.pos.x / S, y = this.pos.z / S;
    const c = Math.floor((x / WORLD) * 10), r = Math.floor((y / WORLD) * 10);
    const cell = c >= 0 && c < 10 && r >= 0 && r < 10 ? COLS[c] + (r + 1) : 'außerhalb';
    let place = 'freies Gelände', best = Infinity;
    if (m) for (const p of m.pois) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < p.r && d < best) { best = d; place = p.name; }
    }
    if (place === 'freies Gelände' && m) {
      let nd = Infinity, nn = '';
      for (const p of m.pois) { const d = Math.hypot(p.x - x, p.y - y) - p.r; if (d < nd) { nd = d; nn = p.name; } }
      if (nn) place = `nahe ${nn}`;
    }
    const dirs = ['Osten', 'Süd-Osten', 'Süden', 'Süd-Westen', 'Westen', 'Nord-Westen', 'Norden', 'Nord-Osten'];
    const a = ((this.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const dir = dirs[Math.round(a / (Math.PI / 4)) % 8];
    return { x: Math.round(x), y: Math.round(y), cell, place, dir, h: Math.round(this.pos.y * 10) / 10 };
  }

  private copy() {
    const w = this.where();
    const t = `${w.place}, Feld ${w.cell} (x ${w.x}, y ${w.y}), Höhe ${w.h}, Blick nach ${w.dir}`;
    navigator.clipboard?.writeText(t).then(() => this.toast('Kopiert: ' + t), () => this.toast(t));
  }

  start() {
    const m = this.getMap();
    if (!m) return;
    this.flying = true;
    this.keys.clear();
    // Start: über Old Town, Blick nach Norden
    this.goto(m.town.x, m.town.y + 900, 22, -Math.PI / 2, -0.4);
    this.ui.classList.remove('hidden');
    this.onEnter();
  }

  stop() {
    if (!this.flying) return;
    this.flying = false;
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.classList.add('hidden');
    this.tp.classList.add('hidden');
    this.onExit();
  }

  /** pro Bild: Bewegung berechnen; gibt Kamera-Daten für den Renderer zurück */
  update(dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    const k = this.keys;
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1;
    const v = 18 * this.speed * fast * dt;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + this.touch.fwd;
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const u = (k.has('Space') || k.has('KeyE') ? 1 : 0) - (k.has('KeyC') || k.has('ControlLeft') || k.has('KeyQ') ? 1 : 0) + this.touch.up;
    const cp = Math.cos(this.pitch);
    // vorwärts = in Blickrichtung (auch nach oben/unten), seitwärts waagerecht
    this.pos.x += (Math.cos(this.yaw) * cp * f - Math.sin(this.yaw) * s) * v;
    this.pos.z += (Math.sin(this.yaw) * cp * f + Math.cos(this.yaw) * s) * v;
    this.pos.y += (Math.sin(this.pitch) * f + u) * v;
    const lim = WORLD * S * 1.3;
    this.pos.x = Math.max(-lim * 0.3, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim * 0.3, Math.min(lim, this.pos.z));
    this.pos.y = Math.max(-5, Math.min(400, this.pos.y));
    const now = performance.now();
    if (now - this.lastInfo > 150) {
      this.lastInfo = now;
      const w = this.where();
      this.info.innerHTML = `<b>${w.place}</b><span>Feld ${w.cell}  •  x ${w.x}  y ${w.y}  •  Höhe ${w.h}  •  Blick ${w.dir}  •  Tempo ${this.speed < 1 ? this.speed.toFixed(2) : Math.round(this.speed * 10) / 10}x</span>`;
    }
    return { pos: this.pos, yaw: this.yaw, pitch: this.pitch };
  }
}
