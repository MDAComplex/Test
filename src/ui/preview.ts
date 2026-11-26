import * as THREE from 'three';
import { buildCharacter, buildChute, animateRig, makeToon, CharKind, ChuteKind, Outfit } from '../render/character';

/** kleine 3D-Vorschau der eigenen Figur im Spind (eigener Renderer, nur solange offen) */
export class Preview {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private holder = new THREE.Group();
  private gradient: THREE.DataTexture;
  private toon: (c: number) => THREE.MeshToonMaterial;
  private disposables: { dispose(): void }[] = [];
  private rig: ReturnType<typeof buildCharacter> | null = null;
  private chute: THREE.Group | null = null;
  private showChute = false;
  private raf = 0;
  private t = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.gradient = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
    this.gradient.minFilter = this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.needsUpdate = true;
    this.toon = makeToon(this.gradient);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6f8f55, 1.8));
    const sun = new THREE.DirectionalLight(0xfff3dc, 2.4);
    sun.position.set(3, 6, 4);
    this.scene.add(sun, this.holder);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    this.scene.add(ground);
  }

  set(kind: CharKind, color: number, chute: ChuteKind, showChute: boolean, outfit: Outfit = 'none') {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.holder.clear();
    this.rig = buildCharacter({ kind, shirt: color, seed: 11, gradient: this.gradient, toon: this.toon, outfit });
    this.holder.add(this.rig.body);
    this.disposables.push(...this.rig.mats);
    const c = buildChute(chute, color, this.gradient, new THREE.LineBasicMaterial({ color: 0x4a4a4a }));
    this.chute = c.chute;
    this.chute.visible = showChute;
    this.holder.add(this.chute);
    this.disposables.push(...c.disposables);
    this.showChute = showChute;
    this.resize();
  }

  private resize() {
    const w = this.canvas.clientWidth || 260, h = this.canvas.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // mit Fallschirm weiter weg, damit alles ins Bild passt
    const far = this.showChute ? 15 : 7.2;
    this.camera.position.set(far * 0.75, this.showChute ? 4.2 : 1.9, far * 0.65);
    this.camera.lookAt(0, this.showChute ? 2.9 : 1.15, 0);
    this.camera.updateProjectionMatrix();
  }

  start() {
    const loop = () => {
      this.t += 1 / 60;
      this.holder.rotation.y = this.t * 0.6;
      if (this.rig) {
        animateRig(this.rig, { phase: this.t * 4, amp: 0, aim: 0, twoHanded: false, reload: 0, time: this.t, falling: this.showChute });
      }
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.raf);
    loop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stop();
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
  }
}
