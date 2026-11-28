import * as THREE from 'three';
import { buildCharacter, makeToon, CharKind, Outfit } from '../render/character';
import { animateEmote, EmoteId } from '../render/emotes';

export interface WinChar { kind: CharKind; color: number; outfit: Outfit; emote: EmoteId; name: string; seed: number }

/** Sieges-Szene: Podest mit den Gewinnern, die ihr Emote in Schleife zeigen (eigener kleiner Renderer im Siegesfenster) */
export class Victory {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  private gradient: THREE.DataTexture;
  private toon: (c: number) => THREE.MeshToonMaterial;
  private group = new THREE.Group();
  private rigs: { rig: ReturnType<typeof buildCharacter>; emote: EmoteId; off: number }[] = [];
  private raf = 0;
  private t = 0;
  private last = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.gradient = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
    this.gradient.minFilter = this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.needsUpdate = true;
    this.toon = makeToon(this.gradient);
    const t = (c: number) => new THREE.MeshToonMaterial({ color: c, gradientMap: this.gradient });
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6f8f55, 1.7));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
    sun.position.set(3, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    this.scene.add(sun);
    // goldenes Podest mit hellem Ring
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.38, 56), t(0xffd23f));
    podium.position.y = 0.19;
    podium.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(3.62, 3.75, 0.2, 56), t(0xe0a91f));
    rim.position.y = 0.1;
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.25, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.39;
    this.scene.add(podium, rim, ring, this.group);
  }

  set(chars: WinChar[]) {
    this.group.clear();
    for (const r of this.rigs) r.rig.mats.forEach((m) => m.dispose());
    this.rigs = [];
    const n = chars.length, gap = n > 2 ? 1.65 : 2.1;
    chars.forEach((c, i) => {
      const rig = buildCharacter({ kind: c.kind, shirt: c.color, seed: c.seed, gradient: this.gradient, toon: this.toon, outfit: c.outfit });
      rig.body.position.set((i - (n - 1) / 2) * gap, 0.38, (n > 1 && (i === 0 || i === n - 1)) ? -0.25 : 0);
      rig.body.rotation.y = -Math.PI / 2 + (i - (n - 1) / 2) * -0.12;
      rig.body.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
      this.group.add(rig.body);
      this.rigs.push({ rig, emote: c.emote, off: i * 0.37 });
    });
    this.wide = n > 2;
    this.frameCam();
  }

  private wide = false;
  /** Kamera so setzen, dass die Figuren unter dem Schriftzug und über den Knöpfen stehen (auch auf flachen Handy-Bildschirmen) */
  private frameCam() {
    const h = this.canvas.clientHeight || 600;
    const flat = h < 460;
    const d = (this.wide ? 11.5 : 10) * (flat ? 1.25 : 1);
    this.camera.position.set(0, flat ? 3.0 : this.wide ? 3.3 : 3.1, d);
    this.camera.lookAt(0, flat ? 1.85 : 1.75, 0);
  }

  start() {
    this.stop();
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.resize();
      for (const r of this.rigs) {
        const y = r.rig.body.position.y, x = r.rig.body.position.x, z = r.rig.body.position.z;
        animateEmote(r.rig, r.emote, this.t + r.off);
        // Emote setzt die Körperhöhe relativ: aufs Podest stellen
        r.rig.body.position.set(x, 0.38 + r.rig.body.position.y, z);
        void y;
      }
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() { cancelAnimationFrame(this.raf); }

  private resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const pr = this.renderer.getPixelRatio();
    if (this.canvas.width !== Math.round(w * pr) || this.canvas.height !== Math.round(h * pr)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.frameCam();
      this.camera.updateProjectionMatrix();
    }
  }
}
