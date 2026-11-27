import { Profile, SKINS, saveProfile, levelInfo } from '../profile';
import { CHUTE_COLORS, CHUTE_LOGOS, CHUTE_PATTERNS, ChutePattern } from '../chute';
import { EMOTES, RARITY_LABEL } from '../render/emotes';
import { WRAPS, WrapId } from '../wraps';
import { TIER_COLORS } from '../weapons';
import { Preview } from './preview';
import { fullBody, chuteThumb } from './thumbs';
import { gunIcon } from './portrait';
import type { CharKind, Outfit } from '../render/character';

type Tab = 'char' | 'outfit' | 'color' | 'chute' | 'emote' | 'wrap';
interface Card { id: string; name: string; img: string; rarity: number; level: number; on: boolean; pick: () => void; swatch?: string }

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const CHARS: { id: CharKind; name: string; rarity: number; level: number }[] = [
  { id: 'man', name: 'Max', rarity: 1, level: 1 }, { id: 'woman', name: 'Mia', rarity: 1, level: 1 },
  { id: 'jackal', name: 'Schakal-Wächter', rarity: 4, level: 1 }, { id: 'luchador', name: 'Luchador', rarity: 4, level: 1 },
];
const OUTFITS: { id: Outfit; name: string; rarity: number; level: number }[] = [
  { id: 'none', name: 'Freizeit', rarity: 1, level: 1 }, { id: 'office', name: 'Büro', rarity: 2, level: 1 },
  { id: 'jogger', name: 'Jogger', rarity: 2, level: 1 }, { id: 'astronaut', name: 'Astronaut', rarity: 4, level: 1 },
  { id: 'skeleton', name: 'Skelett', rarity: 5, level: 1 },
];
const TABS: { id: Tab; name: string; icon: string }[] = [
  { id: 'char', name: 'Figur', icon: '<circle cx="12" cy="7" r="4.2"/><path d="M3.5 21c0-4.8 3.8-8 8.5-8s8.5 3.2 8.5 8z"/>' },
  { id: 'outfit', name: 'Outfit', icon: '<path d="M8 3l4 2 4-2 5 4-3 4-2-1v11H8V10l-2 1-3-4z"/>' },
  { id: 'color', name: 'Farbe', icon: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.2-1-1.5-1-2.6 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3zM7 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>' },
  { id: 'chute', name: 'Fallschirm', icon: '<path d="M12 3C6.5 3 2.5 6.6 2 11h20c-.5-4.4-4.5-8-10-8zM3 12l8 8h2l8-8h-2l-7 6-7-6z"/>' },
  { id: 'emote', name: 'Emote', icon: '<circle cx="12" cy="5" r="2.6"/><path d="M4 8l3-1 3 3h4l3-3 3 1-4 4v3l2 6h-2.5L13 17h-2l-1.5 4H7l2-6v-3z"/>' },
  { id: 'wrap', name: 'Lackierung', icon: '<path d="M3 13h11l2-3h5v3l-2 1v2h-4l-1 3h-3l1-3H3z"/>' },
];

/** Spind wie in einem echten Spiel: Kategorien links, große Vorschau in der Mitte, Karten mit Bildern rechts */
export class Locker {
  el: HTMLElement;
  private tab: Tab = 'char';
  private pv: Preview | null = null;

  constructor(private profile: Profile, private onClose: () => void) {
    const d = document.createElement('div');
    d.className = 'screen hidden';
    d.id = 'locker';
    d.innerHTML = `
      <div class="lk">
        <div class="lk-head"><b>SPIND</b><span class="lk-lvl"></span><button class="btn lk-done">FERTIG</button></div>
        <div class="lk-body">
          <nav class="lk-tabs">${TABS.map((t) => `<button data-tab="${t.id}"><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg><span>${t.name}</span></button>`).join('')}</nav>
          <div class="lk-stage"><canvas class="pv" aria-label="Vorschau deiner Figur"></canvas><div class="lk-sel"><b class="lk-sel-name"></b><span class="lk-sel-r"></span></div></div>
          <div class="lk-side"><div class="lk-title"></div><div class="lk-extra"></div><div class="lk-grid"></div></div>
        </div>
      </div>`;
    this.el = d;
    d.querySelector('.lk-done')!.addEventListener('click', () => this.onClose());
    d.querySelectorAll<HTMLElement>('.lk-tabs button').forEach((b) => b.addEventListener('click', () => { this.tab = b.dataset.tab as Tab; this.render(); }));
  }

  open() {
    this.el.classList.remove('hidden');
    if (!this.pv) this.pv = new Preview(this.el.querySelector('.pv') as HTMLCanvasElement);
    this.render();
    this.pv.start();
  }

  close() {
    this.el.classList.add('hidden');
    this.pv?.stop();
  }

  /** neu zeichnen (z. B. nach dem Laden der Plüsch-Figuren) */
  refresh() { if (!this.el.classList.contains('hidden')) this.render(); }

  private get level() { return levelInfo(this.profile.xp).level; }
  private color() { return (SKINS.find((s) => s.id === this.profile.skin) ?? SKINS[0]).color; }

  private save() { saveProfile(this.profile); this.render(); }

  private render() {
    const pr = this.profile, lvl = this.level;
    this.el.querySelector('.lk-lvl')!.textContent = `Level ${lvl}`;
    this.el.querySelectorAll<HTMLElement>('.lk-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const extra = this.el.querySelector('.lk-extra') as HTMLElement;
    extra.innerHTML = '';
    const plush = pr.char === 'jackal' || pr.char === 'luchador';
    const col = this.color();
    let cards: Card[] = [];
    let title = '';
    let sel = { name: '', rarity: 1 };
    switch (this.tab) {
      case 'char':
        title = 'Figur';
        cards = CHARS.map((c) => ({ id: c.id, name: c.name, img: fullBody(c.id, col, plush || c.id === 'jackal' || c.id === 'luchador' ? 'none' : pr.outfit), rarity: c.rarity, level: c.level, on: pr.char === c.id, pick: () => { pr.char = c.id as Profile['char']; this.save(); } }));
        break;
      case 'outfit': {
        title = 'Outfit';
        const base: CharKind = plush ? 'man' : pr.char;
        if (plush) extra.innerHTML = '<div class="lk-note">Outfits gibt es für Max und Mia. Der Schakal und der Luchador haben ihr eigenes Kostüm.</div>';
        cards = OUTFITS.map((o) => ({ id: o.id, name: o.name, img: fullBody(base, col, o.id), rarity: o.rarity, level: o.level, on: pr.outfit === o.id, pick: () => { pr.outfit = o.id; if (plush) pr.char = 'man'; this.save(); } }));
        break;
      }
      case 'color':
        title = 'Farbe';
        if (plush) extra.innerHTML = '<div class="lk-note">Die Farbe gilt für Max und Mia (Plüsch-Figuren behalten ihre Farben).</div>';
        cards = SKINS.map((s) => ({ id: s.id, name: s.name, img: fullBody(plush ? 'man' : pr.char, s.color, plush ? 'none' : pr.outfit), rarity: s.level >= 12 ? 4 : s.level >= 5 ? 3 : s.level >= 2 ? 2 : 1, level: s.level, on: pr.skin === s.id, pick: () => { pr.skin = s.id; this.save(); }, swatch: hex(s.color) }));
        break;
      case 'chute': {
        title = 'Fallschirm';
        const d = pr.chuteDesign;
        // Form + Muster als Bildkarten, darunter Farben, Logo und Text
        const forms: Card[] = (['round', 'wing'] as const).map((k) => ({ id: k, name: k === 'round' ? 'Rundkappe' : 'Gleitschirm', img: chuteThumb(k, d), rarity: k === 'wing' ? 2 : 1, level: 1, on: pr.chute === k, pick: () => { pr.chute = k; this.save(); } }));
        // Muster-Vorschau: bei zu ähnlichen Farben mit kräftigen Beispielfarben, damit man das Muster erkennt
        const lum = (n: number) => ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
        const demo = Math.abs(lum(d.color) - lum(d.accent)) < 50 ? { color: 0x3d8cf0, accent: 0xffc93c } : { color: d.color, accent: d.accent };
        const pats: Card[] = CHUTE_PATTERNS.map((p) => ({ id: p.id, name: p.name, img: chuteThumb(pr.chute, { ...d, ...demo, pattern: p.id, logo: 'none', text: '' }), rarity: p.level >= 13 ? 5 : p.level >= 8 ? 4 : p.level >= 4 ? 3 : p.level >= 2 ? 2 : 1, level: p.level, on: (d.pattern ?? 'bahnen') === p.id, pick: () => { d.pattern = p.id as ChutePattern; this.save(); } }));
        cards = [...forms, ...pats];
        extra.innerHTML = `
          <div class="lk-row"><span>Farbe</span><div class="lk-sw" data-k="color">${CHUTE_COLORS.map((c) => `<button style="--c:${hex(c)}" data-c="${c}" class="${d.color === c ? 'on' : ''}" aria-label="Farbe"></button>`).join('')}</div></div>
          <div class="lk-row"><span>Muster-Farbe</span><div class="lk-sw" data-k="accent">${CHUTE_COLORS.map((c) => `<button style="--c:${hex(c)}" data-c="${c}" class="${d.accent === c ? 'on' : ''}" aria-label="Musterfarbe"></button>`).join('')}</div></div>
          <div class="lk-row"><span>Logo</span><div class="lk-chips">${CHUTE_LOGOS.map((l) => `<button data-logo="${l.id}" class="${d.logo === l.id ? 'on' : ''}">${l.name}</button>`).join('')}</div></div>
          <div class="lk-row"><label for="lk-text">Text</label><input id="lk-text" maxlength="12" placeholder="z. B. dein Name" autocomplete="off"></div>`;
        extra.querySelectorAll<HTMLElement>('.lk-sw').forEach((box) => box.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => { d[box.dataset.k as 'color' | 'accent'] = Number(b.dataset.c); this.save(); })));
        extra.querySelectorAll<HTMLButtonElement>('.lk-chips button').forEach((b) => b.addEventListener('click', () => { d.logo = b.dataset.logo as never; this.save(); }));
        const ti = extra.querySelector('input') as HTMLInputElement;
        ti.value = d.text;
        ti.addEventListener('input', () => { d.text = ti.value.slice(0, 12); saveProfile(pr); this.updatePreview(); });
        ti.addEventListener('keydown', (ev) => ev.stopPropagation());
        sel = { name: (CHUTE_PATTERNS.find((p) => p.id === (d.pattern ?? 'bahnen'))?.name ?? '') + ' · ' + (pr.chute === 'round' ? 'Rundkappe' : 'Gleitschirm'), rarity: 1 };
        break;
      }
      case 'emote':
        title = 'Sieges-Emote';
        extra.innerHTML = '<div class="lk-note">Das macht deine Figur auf dem Podest, wenn du gewinnst.</div>';
        cards = EMOTES.map((e) => ({ id: e.id, name: e.name, img: fullBody(pr.char, col, plush ? 'none' : pr.outfit, e.id), rarity: e.rarity, level: e.level, on: pr.emote === e.id, pick: () => { pr.emote = e.id; this.save(); } }));
        break;
      case 'wrap':
        title = 'Waffenlackierung';
        extra.innerHTML = '<div class="lk-note">Gilt für alle Waffen, die du trägst. Goldene Waffen bleiben golden.</div>';
        cards = WRAPS.map((w) => ({ id: w.id, name: w.name, img: gunIcon('rifle', 3, w.id), rarity: w.rarity, level: w.level, on: (pr.wrap ?? 'none') === w.id, pick: () => { pr.wrap = w.id; this.save(); } }));
        break;
    }
    this.el.querySelector('.lk-title')!.textContent = title;
    const on = cards.find((c) => c.on);
    if (on && this.tab !== 'chute') sel = { name: on.name, rarity: on.rarity };
    this.el.querySelector('.lk-sel-name')!.textContent = sel.name;
    const r = this.el.querySelector('.lk-sel-r') as HTMLElement;
    r.textContent = this.tab === 'chute' ? '' : RARITY_LABEL[sel.rarity] ?? (sel.rarity === 2 ? 'Ungewöhnlich' : '');
    r.style.background = hex(TIER_COLORS[sel.rarity] ?? 0xbfc5cc);
    r.style.display = r.textContent ? '' : 'none';
    const grid = this.el.querySelector('.lk-grid') as HTMLElement;
    grid.classList.toggle('wide', this.tab === 'wrap');
    grid.innerHTML = '';
    for (const c of cards) {
      const locked = lvl < c.level;
      const b = document.createElement('button');
      b.className = 'lk-card' + (c.on ? ' on' : '') + (locked ? ' locked' : '');
      b.style.setProperty('--rc', hex(TIER_COLORS[c.rarity] ?? 0xbfc5cc));
      b.innerHTML = `<img alt="" src="${c.img}"><span class="lk-n"></span>${locked ? `<span class="lk-lock"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1v11H6V10zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>Level ${c.level}</span>` : ''}${c.on ? '<span class="lk-check">✓</span>' : ''}`;
      b.querySelector('.lk-n')!.textContent = c.name;
      b.title = locked ? `${c.name}: ab Level ${c.level}` : c.name;
      if (!locked) b.addEventListener('click', c.pick);
      grid.append(b);
    }
    this.updatePreview();
  }

  private updatePreview() {
    const pr = this.profile;
    const plush = pr.char === 'jackal' || pr.char === 'luchador';
    this.pv?.set(pr.char, this.color(), pr.chute, this.tab === 'chute', plush ? 'none' : pr.outfit, pr.chuteDesign, {
      emote: this.tab === 'emote' ? pr.emote : null,
      gun: this.tab === 'wrap' ? { id: 'rifle', tier: 3, wrap: (pr.wrap ?? 'none') as WrapId } : null,
    });
  }
}
