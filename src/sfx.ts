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
  step() { if (this.ok()) this.burst(380 + Math.random() * 120, 1.2, 0.06, 0.07, 'lowpass'); }
  zoneWarn() { if (this.ok()) this.tone(520, 380, 0.18, 0.12, 'square'); }
  incoming() { if (this.ok()) { this.tone(700, 1050, 0.25, 0.15, 'triangle'); setTimeout(() => this.ctx && this.enabled && this.tone(1050, 1400, 0.25, 0.15, 'triangle'), 180); } }
  reload() { if (this.ok()) { this.burst(2200, 3, 0.05, 0.12, 'bandpass'); setTimeout(() => this.ctx && this.enabled && this.burst(1600, 3, 0.06, 0.14, 'bandpass'), 220); } }
  private hum: { o: OscillatorNode; g: GainNode } | null = null;
  /** Brummen des Flugzeugs (0 = aus) */
  planeHum(level: number) {
    if (!this.ctx || !this.master) return;
    const c = this.ctx;
    if (!this.hum && level > 0 && this.enabled) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 62;
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = c.createGain();
      g.gain.value = 0;
      o.connect(f).connect(g).connect(this.master);
      o.start();
      this.hum = { o, g };
    }
    if (this.hum) {
      this.hum.g.gain.setTargetAtTime(this.enabled ? level * 0.12 : 0, c.currentTime, 0.2);
      if (level <= 0) {
        const h = this.hum;
        this.hum = null;
        setTimeout(() => { try { h.o.stop(); } catch { /* schon gestoppt */ } }, 800);
      }
    }
  }
  private music: { nodes: AudioScheduledSourceNode[]; gain: GainNode; timer: number } | null = null;
  /** ruhige, sich wiederholende Hintergrundmusik fürs Menü */
  menuMusic(on: boolean) {
    if (!this.ctx || !this.master) return;
    if (on && this.enabled && !this.music) {
      const c = this.ctx;
      const gain = c.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.07, c.currentTime, 1.5);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      gain.connect(lp).connect(this.master);
      // Akkordfolge: C – Am – F – G, jeweils 3 s
      const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
      const nodes: AudioScheduledSourceNode[] = [];
      let i = 0;
      const play = () => {
        const t = c.currentTime;
        for (const f of chords[i % chords.length]) {
          const o = c.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f / 2;
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.5, t + 0.6);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
          o.connect(g).connect(gain);
          o.start(t);
          o.stop(t + 3.3);
        }
        // kleine Melodienote obendrauf
        const m = c.createOscillator();
        m.type = 'sine';
        m.frequency.value = chords[i % chords.length][2] * (i % 2 ? 2 : 1.5);
        const mg = c.createGain();
        mg.gain.setValueAtTime(0.0001, t + 1);
        mg.gain.exponentialRampToValueAtTime(0.25, t + 1.1);
        mg.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
        m.connect(mg).connect(gain);
        m.start(t + 1);
        m.stop(t + 2.5);
        i++;
      };
      play();
      const timer = window.setInterval(play, 3000);
      this.music = { nodes, gain, timer };
    } else if ((!on || !this.enabled) && this.music) {
      const mu = this.music;
      this.music = null;
      window.clearInterval(mu.timer);
      mu.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => mu.gain.disconnect(), 1500);
    }
  }
  kill() { if (this.ok()) { this.tone(660, 660, 0.08, 0.2, 'square'); setTimeout(() => this.ctx && this.enabled && this.tone(990, 990, 0.12, 0.2, 'square'), 90); } }
}
