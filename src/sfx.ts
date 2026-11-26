import { WeaponId } from './weapons';

/** Kleine Soundeffekte, komplett per Web Audio erzeugt (keine Audiodateien). */
export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private budget = 0;

  unlock() {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.45;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      void this.ctx.resume();
    } catch { /* kein Ton verfügbar */ }
  }

  /** einmal pro Bild aufrufen: begrenzt gleichzeitige Sounds */
  frame() { this.budget = 7; }

  private ok() {
    if (!this.enabled || !this.ctx || !this.master || this.budget <= 0) return false;
    this.budget--;
    return true;
  }

  private burst(freq: number, q: number, dur: number, vol: number, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx!, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.4), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  private tone(freq: number, end: number, dur: number, vol: number, type: OscillatorType = 'sine') {
    const c = this.ctx!, t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  shot(id: WeaponId, dist: number) {
    const v = Math.max(0, 1 - dist / 1100);
    if (v < 0.03 || !this.ok()) return;
    switch (id) {
      case 'pistol': this.burst(1900, 0.8, 0.12, 0.5 * v); this.tone(240, 90, 0.08, 0.22 * v); break;
      case 'smg': this.burst(2500, 1.1, 0.07, 0.34 * v); this.tone(300, 120, 0.05, 0.12 * v, 'square'); break;
      case 'shotgun': this.burst(950, 0.6, 0.3, 0.85 * v); this.tone(120, 45, 0.22, 0.45 * v); break;
      case 'rifle': this.burst(1500, 0.9, 0.11, 0.5 * v); this.tone(170, 70, 0.1, 0.28 * v); break;
      case 'sniper': this.burst(700, 0.5, 0.5, 0.95 * v); this.tone(95, 35, 0.4, 0.55 * v); this.burst(3200, 2, 0.6, 0.12 * v, 'highpass'); break;
    }
  }
  hit() { if (this.ok()) this.tone(880, 520, 0.06, 0.12, 'triangle'); }
  hurt() { if (this.ok()) { this.tone(180, 90, 0.15, 0.3, 'sawtooth'); } }
  pickup() { if (this.ok()) { this.tone(620, 980, 0.12, 0.2, 'triangle'); } }
  crate() { if (this.ok()) { this.burst(500, 0.7, 0.25, 0.4, 'lowpass'); this.tone(520, 1040, 0.25, 0.18, 'triangle'); } }
  jump() { if (this.ok()) this.burst(500, 0.4, 0.8, 0.35, 'lowpass'); }
  kill() { if (this.ok()) { this.tone(660, 660, 0.08, 0.2, 'square'); setTimeout(() => this.ctx && this.enabled && this.tone(990, 990, 0.12, 0.2, 'square'), 90); } }
}
