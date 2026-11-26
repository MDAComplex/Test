import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { S, WORLD, PLANE_Z, PLANE_TIME } from '../config';
import { Game, Fighter, GameEvent, Loot, Bullet, Obstacle, Airdrop, isContainer } from '../sim/game';
import { WEAPONS, TIER_COLORS, WeaponId } from '../weapons';
import { LootKind } from '../mapgen';
import { buildCharacter, buildChute, animateRig, poseLying, poseCrawl, makeToon, Rig } from './character';

const W = WORLD * S;
const WALL_H = 2.1;
const PITCH = (58 * Math.PI) / 180;
const PITCH_AIR = (74 * Math.PI) / 180;
const WATER = 0x3aa6dc;

const C = {
  grass: '#86c95a',
  grassLight: '#97d66a',
  grassDark: '#74b84c',
  forest: '#5d9f43',
  path: '#d8b27a',
  pathLight: '#e4c48e',
  plaza: '#dccfb4',
  sand: '#ecd59a',
  wheat: '#e6c86e',
  wheatDark: '#d2b155',
  trunk: 0x8a5a36,
  leaves: [0x5cb84f, 0x4ea845, 0x66c257],
  bush: 0x46a443,
  rock: 0xa9afb8,
  walls: [0xf6ead2, 0xe3eef5, 0xf3ddd2, 0xeaf2dc],
  roofs: [0xe2583e, 0x3d82dc, 0x2fa597, 0xeba13a],
  trim: 0x8b6a4a,
};

/** Aussehen der Geschosse je Waffe */
const SHOT: Record<WeaponId, { color: number; len: number; thick: number; flash: number; shake: number }> = {
  fists: { color: 0xffffff, len: 0.1, thick: 0.1, flash: 0, shake: 0.05 },
  pistol: { color: 0xffe27a, len: 0.63, thick: 0.11, flash: 0.9, shake: 0.06 },
  smg: { color: 0xffa040, len: 0.58, thick: 0.1, flash: 0.75, shake: 0.05 },
  shotgun: { color: 0xff7a3a, len: 0.34, thick: 0.11, flash: 1.6, shake: 0.28 },
  rifle: { color: 0x9ff4ff, len: 1.31, thick: 0.13, flash: 1.1, shake: 0.09 },
  sniper: { color: 0xf3b0ff, len: 2.73, thick: 0.175, flash: 1.9, shake: 0.4 },
  minigun: { color: 0xffd36a, len: 0.95, thick: 0.11, flash: 0.9, shake: 0.06 },
  rocket: { color: 0xffffff, len: 0.1, thick: 0.1, flash: 1.6, shake: 0.2 },
};

interface FighterView {
  root: THREE.Group;
  lean: THREE.Group;
  rig: Rig;
  chute: THREE.Group;
  flash: number;
  weaponId: string;
  walkT: number;
  amp: number;
  deadT: number;
  aimBlend: number;
  recoil: number;
  dustT: number;
  spin: THREE.Object3D | null;
  yaw: number;
  reloadBlend: number;
  punchT: number;
  punchArm: 0 | 1;
}
interface Particle { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; vx: number; vy: number; vz: number; life: number; max: number }
interface Puff { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number }
interface LootView { root: THREE.Group; item: THREE.Group; pop: number; x: number; y: number; from?: { x: number; y: number } }
interface CrateView { lid: THREE.Group; glow: THREE.Mesh; openT: number; kind: string; body: THREE.Group; o: Obstacle }
interface FadeView { meshes: THREE.Mesh[]; x: number; y: number; r: number; faded: boolean; normal: THREE.Material; fade: THREE.Material; wobble: number; base: THREE.Vector3[] }
interface HouseView { roof: THREE.Group; roofMats: THREE.Material[]; wallMat: THREE.MeshToonMaterial; fade: number }
interface Timed { obj: THREE.Object3D; life: number; max: number; update: (t: number) => void }
interface DropView { root: THREE.Group; chute: THREE.Group; smokeT: number; landed: boolean }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Tod { name: string; sky: number; ground: number; hemi: number; sun: number; sunI: number; off: [number, number, number]; water: number }
const TODS: Tod[] = [
  { name: 'Mittag', sky: 0xdff1ff, ground: 0x6f8f55, hemi: 1.5, sun: 0xfff3dc, sunI: 2.6, off: [-30, 70, 22], water: 0x3aa6dc },
  { name: 'Abendrot', sky: 0xffeadb, ground: 0x6f6650, hemi: 1.4, sun: 0xffc895, sunI: 2.25, off: [-70, 38, 18], water: 0x3a90c2 },
  { name: 'Morgen', sky: 0xd6e8ff, ground: 0x5f8a66, hemi: 1.35, sun: 0xffe2b8, sunI: 2.2, off: [62, 42, -24], water: 0x3b9ccc },
];

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function gableGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: THREE.Group | null = null;
  camTarget = new THREE.Vector3(W / 2, 0, W / 2);
  baseDist = 30;
  pitch = PITCH;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  /** Tageszeit der Runde: Licht, Farben, Sonnenrichtung */
  tod = TODS[0];
  private windTime = { value: 0 };
  private shake = 0;

  private fighterViews = new Map<Fighter, FighterView>();
  private lootViews = new Map<number, LootView>();
  private crateViews = new Map<number, CrateView>();
  private dropViews = new Map<number, DropView>();
  private bulletViews = new Map<Bullet, THREE.Object3D>();
  private bulletPools = new Map<string, THREE.Object3D[]>();
  private particles: Particle[] = [];
  private puffs: Puff[] = [];
  private timed: Timed[] = [];
  private canopies: FadeView[] = [];
  private bushes: FadeView[] = [];
  private houses: HouseView[] = [];
  private ponds: THREE.Mesh[] = [];
  private zoneMat!: THREE.ShaderMaterial;
  private wallMat!: THREE.ShaderMaterial;
  private waterMat!: THREE.ShaderMaterial;
  private aimMat!: THREE.ShaderMaterial;
  private aimLine!: THREE.Mesh;
  private zoneWall!: THREE.Mesh;
  private plane!: THREE.Group;
  private props: THREE.Object3D[] = [];
  private contrailT = 0;
  private playerRing!: THREE.Mesh;
  private doorTex: THREE.CanvasTexture | null = null;
  private doorGlowTex: THREE.CanvasTexture | null = null;
  private doorLights: THREE.Mesh[] = [];
  private progMesh: THREE.Mesh | null = null;
  private progKey = '';
  private progTrack: THREE.Mesh | null = null;
  private progTrackMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
  private progMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  private perRound: { dispose(): void }[] = [];
  private time = 0;
  private gradient: THREE.DataTexture;
  private gunCache = new Map<WeaponId, THREE.Group>();
  private charToon: (c: number) => THREE.MeshToonMaterial;
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.1);

  private g = {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    circle: new THREE.CircleGeometry(1, 40),
    gable: gableGeometry(),
    rock: (() => {
      // rundere, unregelmäßige Felsen: Ikosaeder mit leichtem Rauschen
      const g = new THREE.IcosahedronGeometry(1, 2);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const n = Math.sin(x * 3.1 + y * 1.7) * 0.5 + Math.sin(z * 2.3 - x * 1.3) * 0.5;
        const k = 1 + n * 0.13;
        pos.setXYZ(i, x * k, y * k * (y < 0 ? 0.7 : 1), z * k);
      }
      g.computeVertexNormals();
      return g;
    })(),
    blob: new THREE.IcosahedronGeometry(1, 1),
    puff: new THREE.IcosahedronGeometry(1, 0),
    trunk: new THREE.CylinderGeometry(0.28, 0.4, 1, 8),
    torso: new THREE.CapsuleGeometry(0.38, 0.34, 6, 14),
    leg: new THREE.CapsuleGeometry(0.14, 0.42, 4, 8),
    arm: new THREE.CapsuleGeometry(0.11, 0.38, 4, 8),
    head: new THREE.SphereGeometry(0.44, 20, 14),
    cap: new THREE.SphereGeometry(0.47, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    hand: new THREE.SphereGeometry(0.13, 10, 8),
    eye: new THREE.SphereGeometry(0.07, 8, 6),
    dome: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.4),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
    cylX: new THREE.CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2),
    coneX: new THREE.ConeGeometry(1, 1, 14).rotateZ(-Math.PI / 2),
    halfCylX: new THREE.CylinderGeometry(1, 1, 1, 14, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2),
    capsuleX: new THREE.CapsuleGeometry(1, 6, 6, 16).rotateZ(Math.PI / 2),
    ring: new THREE.RingGeometry(0.82, 1, 48),
    beam: new THREE.CylinderGeometry(0.35, 0.35, 1, 16, 1, true),
    particle: new THREE.BoxGeometry(0.16, 0.16, 0.16),
    bullet: new THREE.BoxGeometry(1, 1, 1),
    flash: new THREE.SphereGeometry(1, 10, 8),
    blade: new THREE.ConeGeometry(0.09, 1, 4).translate(0, 0.5, 0),
    shield: (() => {
      const sh = new THREE.Shape();
      sh.moveTo(-0.5, 0.5);
      sh.quadraticCurveTo(0, 0.62, 0.5, 0.5);
      sh.lineTo(0.5, 0.05);
      sh.quadraticCurveTo(0.45, -0.4, 0, -0.62);
      sh.quadraticCurveTo(-0.45, -0.4, -0.5, 0.05);
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10 });
      g.translate(0, 0, -0.06);
      return g;
    })(),
  };

  private m: Record<string, THREE.Material> = {};
  private disc: Record<number, THREE.MeshBasicMaterial> = {};
  private beam: Record<number, THREE.MeshBasicMaterial> = {};
  private tier: Record<number, THREE.MeshToonMaterial> = {};
  private shotMat: Record<string, THREE.MeshBasicMaterial> = {};
  private crateMat: THREE.MeshToonMaterial;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(WATER);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 800);

    this.gradient = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
    this.gradient.minFilter = this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.needsUpdate = true;
    this.charToon = makeToon(this.gradient);

    this.hemi = new THREE.HemisphereLight(0xdff1ff, 0x6f8f55, 1.5);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff3dc, 2.6);
    this.sun.castShadow = true;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -38;
    sc.right = sc.top = 38;
    sc.near = 1;
    sc.far = 220;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    const toon = (c: number, o: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: this.gradient, ...o });
    const basicT = (c: number, opacity: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, depthWrite: false });
    this.m = {
      shadow: basicT(0x000000, 0.18),
      skin: toon(0xf7d2ad),
      black: toon(0x22232b),
      pants: toon(0x39404f),
      metal: toon(0x2e3138),
      metal2: toon(0x555b66),
      wood: toon(0x8a5a2e),
      glass: toon(0x2b4a6f),
      pack: toon(0x8a5f36),
      trunk: toon(C.trunk),
      rock: toon(C.rock),
      leaves0: toon(C.leaves[0]),
      leaves1: toon(C.leaves[1]),
      leaves2: toon(C.leaves[2]),
      leavesFade: toon(C.leaves[0], { transparent: true, opacity: 0.28, depthWrite: false }),
      bush: toon(C.bush),
      bushFade: toon(C.bush, { transparent: true, opacity: 0.42, depthWrite: false }),
      flash: new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
      line: new THREE.LineBasicMaterial({ color: 0x4a4a4a }),
      planeBody: toon(0xf5f5f5),
      planeAccent: toon(0xff7a2e),
      planeDark: toon(0x3a4150),
      ammo: toon(0xffc23a),
      ammoTip: toon(0xc87a32),
      armor: toon(0x3d8cf0),
      armorLight: toon(0xb5dbff),
      white: toon(0xffffff),
      red: toon(0xe53935),
      fence: toon(0x9a6a3c),
      barrelRed: toon(0xd9483b),
      barrelBlue: toon(0x3b7bd9),
      barrelBand: toon(0x3a3d45),
      hay: toon(0xe9c45a),
      hayDark: toon(0xc9a03e),
      gold: toon(0xffc93c),
      goldDark: toon(0xc98a12),
      purple: toon(0x7b4bd6),
      dropBody: toon(0x5a6b3a),
      dropStripe: toon(0xff8a1e),
      rocketBody: toon(0x6b7a3a),
      mateRing: new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
      playerRing: new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
      crateGlow: basicT(0xffd54a, 0.4),
      chestGlow: basicT(0xffc24a, 0.22),
      dropGlow: basicT(0xff8a1e, 0.25),
      sandBase: toon(0xd9bf83),
      seaFloor: new THREE.MeshBasicMaterial({ color: WATER }),
      dust: basicT(0xe8d8b0, 0.55),
      smoke: basicT(0xe8e8e8, 0.5),
      darkSmoke: basicT(0x55575c, 0.55),
      orangeSmoke: basicT(0xff8a3a, 0.6),
      contrail: basicT(0xffffff, 0.55),
      fire: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
      scorch: basicT(0x2a2620, 0.5),
      sparkle: new THREE.MeshBasicMaterial({ color: 0xffe27a }),
      windowGlass: toon(0x8fc9f0),
      bridgeRail: toon(0x7a5230),
      grassBlade: toon(0x6cbf4a),
      caseBody: toon(0x24272e),
      caseEdge: toon(0x4a505c),
      caseLatch: toon(0xb8bec8),
      caseGlow: new THREE.MeshBasicMaterial({ color: 0xffb627 }),
    };
    // Wind: Kronen und Büsche wiegen sich (Vertex-Verschiebung, oben stärker)
    const wind = (m: THREE.Material, amp: number) => {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uWind = this.windTime;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uWind;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vec4 wpos = modelMatrix * vec4(position, 1.0);
            float sway = sin(uWind * 1.5 + wpos.x * 0.35 + wpos.z * 0.27) * ${amp.toFixed(3)} + sin(uWind * 2.6 + wpos.x * 0.8) * ${(amp * 0.4).toFixed(3)};
            float h = clamp(position.y + 1.0, 0.0, 2.0);
            transformed.x += sway * h;
            transformed.z += sway * 0.6 * h;`);
      };
      m.customProgramCacheKey = () => 'wind' + amp;
    };
    for (const k of ['leaves0', 'leaves1', 'leaves2', 'leavesFade']) wind(this.m[k], 0.05);
    for (const k of ['bush', 'bushFade']) wind(this.m[k], 0.035);
    this.m.grassBlade.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = this.windTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
          vec4 wpos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          #else
          vec4 wpos = modelMatrix * vec4(position, 1.0);
          #endif
          float sway = sin(uWind * 1.8 + wpos.x * 0.45 + wpos.z * 0.33) * 0.18 + sin(uWind * 3.1 + wpos.z * 0.9) * 0.06;
          transformed.x += sway * position.y * position.y;
          transformed.z += sway * 0.5 * position.y * position.y;`);
    };
    this.m.grassBlade.customProgramCacheKey = () => 'grasswind';
    for (const t of [1, 2, 3, 4, 5]) {
      this.disc[t] = new THREE.MeshBasicMaterial({ color: TIER_COLORS[t], transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      this.beam[t] = new THREE.MeshBasicMaterial({ color: TIER_COLORS[t], transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
      this.tier[t] = toon(TIER_COLORS[t]);
    }
    for (const id of Object.keys(SHOT) as WeaponId[]) {
      this.shotMat[id] = new THREE.MeshBasicMaterial({ color: SHOT[id].color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    }
    this.crateMat = toon(0xffffff, {
      map: canvasTexture(128, 128, (c) => {
        c.fillStyle = '#d29a52';
        c.fillRect(0, 0, 128, 128);
        c.strokeStyle = '#b5803f';
        c.lineWidth = 3;
        for (let y = 30; y < 128; y += 24) { c.beginPath(); c.moveTo(14, y); c.lineTo(114, y); c.stroke(); }
        c.strokeStyle = '#7d5426';
        c.lineWidth = 14;
        c.strokeRect(7, 7, 114, 114);
        c.fillStyle = '#cfd3d8';
        for (const [x, y] of [[4, 4], [108, 4], [4, 108], [108, 108]]) c.fillRect(x, y, 16, 16);
      }),
    });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.baseDist = 30 * Math.min(2.2, Math.max(1, 1.1 / this.camera.aspect));
  }

  setQuality(q: 'auto' | 'high' | 'low') {
    if (q === 'auto') q = 'high';
    this.sun.castShadow = q === 'high';
    this.renderer.setPixelRatio(q === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
    this.resize();
  }

  // ---------- Boden ----------

  private groundTexture(game: Game) {
    const N = 2048, k = N / WORLD;
    const map = game.map;
    return canvasTexture(N, N, (c) => {
      const inset = 80 * k, rad = 200 * k;
      c.fillStyle = C.sand;
      c.fillRect(0, 0, N, N);
      c.fillStyle = C.grass;
      c.beginPath();
      c.roundRect(inset, inset, N - inset * 2, N - inset * 2, rad);
      c.fill();
      c.save();
      c.beginPath();
      c.roundRect(inset, inset, N - inset * 2, N - inset * 2, rad);
      c.clip();
      let s = map.seed >>> 0;
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      const soft = (x: number, y: number, r: number, col: string, a: string) => {
        const gr = c.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, col + a);
        gr.addColorStop(1, col + '00');
        c.fillStyle = gr;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      };
      for (let i = 0; i < 90; i++) soft(rnd() * N, rnd() * N, (140 + rnd() * 300) * k, rnd() < 0.5 ? C.grassLight : C.grassDark, 'aa');
      for (const f of map.forests) soft(f.x * k, f.y * k, f.r * 1.15 * k, C.forest, 'ee');

      // Felder
      for (const f of map.fields) {
        const x = (f.x - f.w / 2) * k, y = (f.y - f.h / 2) * k;
        c.fillStyle = C.wheat;
        c.beginPath();
        c.roundRect(x, y, f.w * k, f.h * k, 24 * k);
        c.fill();
        c.strokeStyle = C.wheatDark;
        c.lineWidth = 6 * k;
        for (let yy = y + 20 * k; yy < y + f.h * k - 10 * k; yy += 36 * k) {
          c.beginPath();
          c.moveTo(x + 16 * k, yy);
          c.lineTo(x + f.w * k - 16 * k, yy);
          c.stroke();
        }
      }

      // Wege
      const hs = map.houses;
      const edges = new Set<string>();
      hs.forEach((a, i) => {
        const near = hs.map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 })).filter((o) => o.j !== i).sort((p, q) => p.d - q.d).slice(0, 2);
        for (const n of near) edges.add(i < n.j ? `${i}-${n.j}` : `${n.j}-${i}`);
      });
      const drawPaths = (width: number, color: string) => {
        c.strokeStyle = color;
        c.lineWidth = width * k;
        c.lineCap = 'round';
        for (const e of edges) {
          const [i, j] = e.split('-').map(Number);
          const a = hs[i], b = hs[j];
          const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.15, my = (a.y + b.y) / 2 - (b.x - a.x) * 0.15;
          c.beginPath();
          c.moveTo(a.x * k, a.y * k);
          c.quadraticCurveTo(mx * k, my * k, b.x * k, b.y * k);
          c.stroke();
        }
      };
      drawPaths(70, C.path);
      drawPaths(44, C.pathLight);
      // Dorfplatz
      const t = map.town;
      c.fillStyle = C.path;
      c.beginPath();
      c.arc(t.x * k, t.y * k, 200 * k, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = C.plaza;
      c.beginPath();
      c.arc(t.x * k, t.y * k, 175 * k, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(160,140,110,0.5)';
      c.lineWidth = 2;
      for (let r = 40; r < 175; r += 34) {
        c.beginPath();
        c.arc(t.x * k, t.y * k, r * k, 0, Math.PI * 2);
        c.stroke();
      }
      for (const h of hs) {
        c.fillStyle = C.path;
        c.beginPath();
        c.roundRect((h.x - h.s / 2 - 40) * k, (h.y - h.s / 2 - 40) * k, (h.s + 80) * k, (h.s + 80) * k, 40 * k);
        c.fill();
      }
      // Flussufer (Sand) und Flussbett
      const rv = map.river;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = C.sand;
      c.lineWidth = (rv.width + 70) * k;
      c.beginPath();
      rv.pts.forEach((pt, i) => (i ? c.lineTo(pt.x * k, pt.y * k) : c.moveTo(pt.x * k, pt.y * k)));
      c.stroke();
      // Gras unter den Grasfeldern etwas dunkler
      for (const gf of map.grass) soft(gf.x * k, gf.y * k, gf.r * 1.1 * k, '#5a9c3e', 'ff');
      // Ufer um die Teiche
      for (const p of map.ponds) {
        c.fillStyle = C.sand;
        c.beginPath();
        c.arc(p.x * k, p.y * k, (p.r + 46) * k, 0, Math.PI * 2);
        c.fill();
      }
      for (let i = 0; i < 3800; i++) {
        const x = rnd() * N, y = rnd() * N;
        if (rnd() < 0.88) {
          c.strokeStyle = 'rgba(70,140,50,0.42)';
          c.lineWidth = 1.4;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x - 2, y - 5);
          c.moveTo(x + 2, y);
          c.lineTo(x + 3, y - 5);
          c.stroke();
        } else {
          c.fillStyle = ['#ffffff', '#ffe066', '#ff8fb1'][Math.floor(rnd() * 3)];
          c.beginPath();
          c.arc(x, y, 2, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.restore();
    });
  }

  // ---------- Modelle ----------

  /** Detailliertes Waffenmodell, zeigt nach +X, Ursprung am Griff */
  private makeGun(id: WeaponId) {
    const cached = this.gunCache.get(id);
    if (cached) return cached.clone();
    const g = new THREE.Group();
    const acc = this.tier[WEAPONS[id].tier];
    const p = (geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.rotation.z = rz;
      m.castShadow = true;
      g.add(m);
      return m;
    };
    const B = this.g.box, CX = this.g.cylX;
    switch (id) {
      case 'fists':
        break;
      case 'pistol':
        p(B, this.m.metal, 0.44, 0.13, 0.1, 0.18, 0.06);
        p(B, this.m.metal2, 0.3, 0.08, 0.09, 0.12, -0.03);
        p(B, this.m.metal, 0.1, 0.24, 0.09, 0.01, -0.12, 0, -0.25);
        p(B, acc, 0.16, 0.035, 0.105, 0.24, 0.13);
        break;
      case 'smg':
        p(B, this.m.metal, 0.56, 0.15, 0.12, 0.2, 0.02);
        p(CX, this.m.metal2, 0.24, 0.035, 0.035, 0.6, 0.04);
        p(B, this.m.metal, 0.08, 0.3, 0.07, 0.26, -0.2, 0, 0.1);
        p(B, this.m.metal, 0.09, 0.2, 0.08, 0.02, -0.12, 0, -0.2);
        p(B, this.m.metal2, 0.24, 0.07, 0.06, -0.16, 0.0);
        p(B, acc, 0.22, 0.04, 0.125, 0.24, 0.1);
        break;
      case 'shotgun':
        p(CX, this.m.metal, 0.95, 0.045, 0.045, 0.55, 0.05);
        p(CX, this.m.metal2, 0.7, 0.035, 0.035, 0.45, -0.03);
        p(B, this.m.wood, 0.26, 0.09, 0.11, 0.58, -0.03);
        p(B, this.m.metal, 0.3, 0.15, 0.12, 0.06, 0.01);
        p(B, this.m.wood, 0.38, 0.14, 0.09, -0.26, -0.04, 0, 0.15);
        p(B, acc, 0.16, 0.035, 0.125, 0.06, 0.09);
        break;
      case 'rifle':
        p(B, this.m.metal, 0.5, 0.16, 0.12, 0.15, 0.02);
        p(B, this.m.metal2, 0.32, 0.12, 0.11, 0.52, 0.02);
        p(CX, this.m.metal, 0.3, 0.03, 0.03, 0.82, 0.03);
        p(B, this.m.metal, 0.1, 0.3, 0.08, 0.22, -0.2, 0, 0.28);
        p(B, this.m.metal, 0.09, 0.2, 0.08, 0.0, -0.12, 0, -0.2);
        p(B, this.m.metal2, 0.32, 0.14, 0.09, -0.24, -0.01);
        p(B, this.m.metal, 0.18, 0.06, 0.05, 0.15, 0.13);
        p(B, acc, 0.3, 0.04, 0.125, 0.5, 0.09);
        break;
      case 'sniper':
        p(B, this.m.metal, 0.5, 0.14, 0.11, 0.1, 0.02);
        p(CX, this.m.metal, 0.95, 0.028, 0.028, 0.82, 0.03);
        p(CX, this.m.metal2, 0.42, 0.055, 0.055, 0.14, 0.15);
        p(CX, this.m.glass, 0.03, 0.06, 0.06, 0.36, 0.15);
        p(B, this.m.wood, 0.44, 0.15, 0.09, -0.3, -0.02, 0, 0.08);
        p(B, this.m.metal, 0.09, 0.2, 0.08, -0.02, -0.12, 0, -0.2);
        p(B, this.m.metal2, 0.02, 0.26, 0.02, 0.9, -0.12, 0.05, 0.3);
        p(B, this.m.metal2, 0.02, 0.26, 0.02, 0.9, -0.12, -0.05, 0.3);
        p(B, acc, 0.24, 0.04, 0.115, 0.1, 0.09);
        break;
      case 'minigun': {
        p(B, this.m.metal, 0.46, 0.26, 0.24, 0.02, 0.0);
        p(B, this.m.metal2, 0.22, 0.24, 0.22, -0.02, -0.24);
        p(B, this.m.metal, 0.1, 0.1, 0.3, -0.1, 0.18);
        const spin = new THREE.Group();
        spin.name = 'spin';
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const b = new THREE.Mesh(CX, this.m.metal2);
          b.scale.set(0.85, 0.028, 0.028);
          b.position.set(0.45, Math.cos(a) * 0.075, Math.sin(a) * 0.075);
          spin.add(b);
        }
        const cap = new THREE.Mesh(CX, this.m.metal);
        cap.scale.set(0.06, 0.12, 0.12);
        cap.position.x = 0.78;
        spin.add(cap);
        g.add(spin);
        p(B, acc, 0.3, 0.05, 0.25, 0.02, 0.14);
        break;
      }
      case 'rocket':
        p(CX, this.m.rocketBody, 1.25, 0.11, 0.11, 0.3, 0.06);
        p(CX, this.m.metal, 0.08, 0.13, 0.13, 0.92, 0.06);
        p(this.g.coneX, this.m.red, 0.14, 0.08, 0.08, 1.0, 0.06);
        p(B, this.m.metal, 0.09, 0.22, 0.08, 0.06, -0.12, 0, -0.15);
        p(B, this.m.metal2, 0.14, 0.08, 0.05, 0.25, 0.2);
        p(B, acc, 0.3, 0.05, 0.12, 0.3, 0.17);
        break;
    }
    this.gunCache.set(id, g);
    return g.clone();
  }

  private chuteTexture(color: number) {
    return canvasTexture(256, 32, (c) => {
      const n = 12;
      for (let i = 0; i < n; i++) {
        c.fillStyle = i % 2 === 0 ? hex(color) : '#ffffff';
        c.fillRect((i / n) * 256, 0, 256 / n + 1, 32);
      }
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(0, 26, 256, 6);
    });
  }

  private makeChute(color: number, size: number, harnessY: number) {
    const chute = new THREE.Group();
    const tex = this.chuteTexture(color);
    const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: this.gradient, side: THREE.DoubleSide });
    this.perRound.push(tex, mat);
    const canopy = new THREE.Mesh(this.g.dome, mat);
    canopy.scale.set(size, size * 0.55, size);
    canopy.position.y = harnessY + size * 1.25;
    canopy.castShadow = true;
    const pts: number[] = [];
    const rimR = size * Math.sin(Math.PI * 0.4), rimY = canopy.position.y + size * 0.55 * Math.cos(Math.PI * 0.4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pts.push(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR, 0, harnessY, 0);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.perRound.push(lg);
    chute.add(canopy, new THREE.LineSegments(lg, this.m.line));
    return chute;
  }

  private addFighter(f: Fighter, mate = false) {
    const root = new THREE.Group();
    if (mate) {
      // Teamkameraden: blauer Ring am Boden
      const ring = new THREE.Mesh(this.g.ring, this.m.mateRing);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      ring.scale.setScalar(1.1);
      root.add(ring);
    }
    const shadow = new THREE.Mesh(this.g.circle, this.m.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    shadow.scale.setScalar(0.7);
    const lean = new THREE.Group();
    const rig = buildCharacter({ kind: f.look.char, shirt: f.color, seed: f.id * 7 + 3, gradient: this.gradient, toon: this.charToon });
    rig.gunKick.add(this.makeGun(f.weapon.id));
    lean.add(rig.body);
    const { chute, disposables } = buildChute(f.look.chute, f.color, this.gradient, this.m.line);
    this.perRound.push(...disposables, ...rig.mats);
    chute.visible = false;
    root.add(shadow, lean, chute);
    this.world!.add(root);
    const v: FighterView = {
      root, lean, rig, chute, flash: 0, weaponId: f.weapon.id, walkT: Math.random() * 6, amp: 0, deadT: 0,
      aimBlend: 0, recoil: 0, dustT: 0, spin: null, yaw: f.aim, reloadBlend: 0, punchT: 0, punchArm: 0,
    };
    v.spin = rig.gunKick.getObjectByName('spin') ?? null;
    this.fighterViews.set(f, v);
  }

  private addLoot(l: Loot, pop: boolean) {
    const root = new THREE.Group();
    root.position.set(l.x * S, 0, l.y * S);
    const tier = this.lootTier(l.kind);
    const ring = new THREE.Mesh(this.g.ring, this.disc[tier]);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.scale.setScalar(1.15);
    root.add(ring);
    // Lichtstrahl nur bei sehr seltenen Waffen (lila/gold)
    if (tier >= 4 && l.kind.startsWith('w:')) {
      const beam = new THREE.Mesh(this.g.beam, this.beam[tier]);
      beam.scale.set(1.4, tier >= 5 ? 6 : 3.2, 1.4);
      beam.position.y = tier >= 5 ? 3 : 1.6;
      root.add(beam);
    }
    const item = new THREE.Group();
    item.position.y = 0.95;
    item.scale.setScalar(1.45);
    const box = (mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(this.g.box, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.castShadow = true;
      item.add(m);
    };
    if (l.kind.startsWith('w:')) {
      const g = this.makeGun(l.kind.slice(2) as WeaponId);
      g.scale.setScalar(1.15);
      g.position.x = -0.45;
      item.add(g);
    } else if (l.kind === 'ammo') {
      for (let i = -1; i <= 1; i++) {
        const c = new THREE.Mesh(this.g.cyl, this.m.ammo);
        c.scale.set(0.1, 0.4, 0.1);
        c.position.set(i * 0.24, 0, 0);
        const tip = new THREE.Mesh(this.g.cyl, this.m.ammoTip);
        tip.scale.set(0.07, 0.12, 0.07);
        tip.position.set(i * 0.24, 0.25, 0);
        item.add(c, tip);
      }
    } else if (l.kind === 'armor') {
      // Schild-Symbol: oben gerade, unten spitz, mit hellem Rand und Emblem
      const rim = new THREE.Mesh(this.g.shield, this.m.armorLight);
      rim.scale.set(0.86, 0.86, 0.9);
      rim.position.z = -0.03;
      const face = new THREE.Mesh(this.g.shield, this.m.armor);
      face.scale.set(0.72, 0.72, 1);
      face.position.z = 0.02;
      const emblem = new THREE.Mesh(this.g.shield, this.m.armorLight);
      emblem.scale.set(0.3, 0.3, 1.4);
      emblem.position.set(0, 0.04, 0.03);
      for (const m of [rim, face, emblem]) { m.castShadow = true; item.add(m); }
    } else if (l.kind === 'bigmed') {
      box(this.m.red, 0.95, 0.6, 0.6);
      box(this.m.white, 0.18, 0.05, 0.5, 0, 0.31, 0);
      box(this.m.white, 0.6, 0.05, 0.18, 0, 0.31, 0);
      box(this.m.metal, 0.3, 0.08, 0.08, 0, 0.38, 0);
    } else {
      box(this.m.white, 0.62, 0.4, 0.45);
      box(this.m.red, 0.12, 0.04, 0.34, 0, 0.21, 0);
      box(this.m.red, 0.4, 0.04, 0.12, 0, 0.21, 0);
    }
    root.add(item);
    if (pop) root.scale.setScalar(0.01);
    this.world!.add(root);
    this.lootViews.set(l.id, { root, item, pop: pop ? 0 : 1, x: l.x, y: l.y, from: pop ? l.from : undefined });
  }

  private lootTier(k: LootKind) {
    if (k.startsWith('w:')) return WEAPONS[k.slice(2) as WeaponId].tier;
    return k === 'armor' ? 3 : k === 'bigmed' ? 3 : k === 'medkit' ? 2 : 1;
  }

  /** Kiste / Truhe / Versorgungspaket mit aufklappbarem Deckel */
  private chestTex: THREE.CanvasTexture | null = null;
  private chestMat(): THREE.MeshToonMaterial {
    if (!this.chestTex) {
      this.chestTex = canvasTexture(128, 128, (c) => {
        c.fillStyle = '#a8703c';
        c.fillRect(0, 0, 128, 128);
        c.strokeStyle = '#7f5129';
        c.lineWidth = 4;
        for (let y = 0; y <= 128; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(128, y); c.stroke(); }
        c.strokeStyle = 'rgba(255,255,255,0.08)';
        c.lineWidth = 2;
        for (let y = 8; y < 128; y += 32) { c.beginPath(); c.moveTo(6, y); c.lineTo(122, y); c.stroke(); }
      });
    }
    if (!this.m.chestWood) this.m.chestWood = new THREE.MeshToonMaterial({ map: this.chestTex, gradientMap: this.gradient });
    return this.m.chestWood as THREE.MeshToonMaterial;
  }

  /** Truhe / Versorgungspaket (Kiste nur noch als Fallback) mit aufklappbarem Deckel */
  private makeContainer(o: Obstacle, parent: THREE.Object3D) {
    const body = new THREE.Group();
    body.position.set(o.x * S, 0, o.y * S);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, sx: number, sy: number, sz: number, p: THREE.Object3D = body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      m.receiveShadow = true;
      p.add(m);
      return m;
    };
    const s = Math.max(o.w, o.h) * S;
    const glowMat = o.kind === 'airdrop' ? this.m.dropGlow : this.m.chestGlow;
    const glow = add(this.g.circle, glowMat, 0, 0.04, 0, s * 0.9, s * 0.9, 1);
    glow.rotation.x = -Math.PI / 2;
    glow.castShadow = false;
    const lid = new THREE.Group();
    if (o.kind === 'chest') {
      // moderne schwarze Loot-Kiste (Waffenkiste) mit Leuchtstreifen
      const w = o.w * S, d = o.h * S, h = 0.8;
      add(this.g.box, this.m.caseBody, 0, h / 2, 0, w, h, d);
      // Kantenschutz unten und an den Ecken
      add(this.g.box, this.m.caseEdge, 0, 0.06, 0, w + 0.08, 0.12, d + 0.08);
      for (const cx of [-w / 2, w / 2]) for (const cz of [-d / 2, d / 2]) add(this.g.box, this.m.caseEdge, cx, h / 2, cz, 0.16, h + 0.04, 0.16);
      // Leuchtstreifen rundherum
      add(this.g.box, this.m.caseGlow, 0, h * 0.55, d / 2 + 0.01, w * 0.86, 0.07, 0.02);
      add(this.g.box, this.m.caseGlow, 0, h * 0.55, -d / 2 - 0.01, w * 0.86, 0.07, 0.02);
      for (const cx of [-w / 2 - 0.01, w / 2 + 0.01]) add(this.g.box, this.m.caseGlow, cx, h * 0.55, 0, 0.02, 0.07, d * 0.8);
      // Griffe an den Seiten
      for (const cx of [-w / 2 - 0.08, w / 2 + 0.08]) add(this.g.box, this.m.caseEdge, cx, h * 0.75, 0, 0.08, 0.1, d * 0.4);
      // Deckel: flach, Drehpunkt an der Hinterkante
      lid.position.set(0, h, -d / 2);
      add(this.g.box, this.m.caseBody, 0, 0.12, d / 2, w + 0.04, 0.24, d + 0.04, lid);
      add(this.g.box, this.m.caseEdge, 0, 0.25, d / 2, w * 0.7, 0.04, d * 0.55, lid);
      add(this.g.box, this.m.caseGlow, 0, 0.27, d / 2, w * 0.25, 0.02, 0.06, lid);
      // zwei Verschlüsse vorne
      for (const cx of [-w * 0.28, w * 0.28]) add(this.g.box, this.m.caseLatch, cx, 0.02, d + 0.04, 0.22, 0.26, 0.08, lid);
    } else if (o.kind === 'airdrop') {
      add(this.g.box, this.m.dropBody, 0, 0.9, 0, s, 1.8, s);
      add(this.g.box, this.m.dropStripe, 0, 0.9, 0, s + 0.05, 0.3, s + 0.05);
      add(this.g.box, this.m.dropStripe, 0, 0.9, 0, 0.3, 1.82, s + 0.06);
      lid.position.set(0, 1.8, -s / 2);
      add(this.g.box, this.m.dropBody, 0, 0.12, s / 2, s + 0.1, 0.24, s + 0.1, lid);
      add(this.g.box, this.m.dropStripe, 0, 0.26, s / 2, 0.3, 0.06, s + 0.12, lid);
    } else {
      add(this.g.box, this.crateMat, 0, 0.72, 0, s, 1.44, s);
      lid.position.set(0, 1.44, -s / 2);
      add(this.g.box, this.crateMat, 0, 0.12, s / 2, s + 0.12, 0.24, s + 0.12, lid);
    }
    body.add(lid);
    parent.add(body);
    this.crateViews.set(o.id, { lid, glow, openT: 0, kind: o.kind, body, o });
  }

  // ---------- Aufbau ----------

  build(game: Game, tod?: number) {
    if (this.world) this.scene.remove(this.world);
    this.tod = TODS[tod ?? 0];
    this.hemi.color.setHex(this.tod.sky);
    this.hemi.groundColor.setHex(this.tod.ground);
    this.hemi.intensity = this.tod.hemi;
    this.sun.color.setHex(this.tod.sun);
    this.sun.intensity = this.tod.sunI;
    this.renderer.setClearColor(this.tod.water);
    this.perRound.forEach((m) => m.dispose());
    this.perRound = [];
    this.fighterViews.clear();
    this.lootViews.clear();
    this.crateViews.clear();
    this.dropViews.clear();
    this.bulletViews.clear();
    this.bulletPools.clear();
    this.particles = [];
    this.puffs = [];
    this.timed = [];
    this.canopies = [];
    this.bushes = [];
    this.houses = [];
    this.ponds = [];
    this.progMesh = null;
    this.progTrack = null;
    this.reloadMesh = null;
    this.reloadStep = -1;
    this.reviveMesh = null;
    this.reviveStep = -1;
    this.progKey = '';

    const world = new THREE.Group();
    this.world = world;
    this.scene.add(world);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, parent: THREE.Object3D = world, cast = true) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const flat = (mesh: THREE.Mesh) => {
      mesh.rotation.x = -Math.PI / 2;
      mesh.castShadow = false;
      return mesh;
    };

    // Wasser
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uC: { value: new THREE.Color(this.tod.water) }, uHalf: { value: W / 2 }, uCenter: { value: new THREE.Vector2(W / 2, W / 2) } },
      vertexShader: `varying vec2 vXZ; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vXZ = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uT; uniform vec3 uC; uniform float uHalf; uniform vec2 uCenter; varying vec2 vXZ;
        void main(){
          float w = sin(vXZ.x * 0.35 + uT * 0.8) * sin(vXZ.y * 0.3 - uT * 0.6);
          float glint = smoothstep(0.82, 1.0, w);
          vec3 col = uC * (0.92 + w * 0.06) + vec3(glint * 0.35);
          // Abstand zur Inselkante (nur außerhalb der Insel > 0)
          vec2 q = abs(vXZ - uCenter) - vec2(uHalf);
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
          if (d > 0.0) {
            // flaches, helles Wasser am Ufer
            col = mix(vec3(0.45, 0.85, 0.9), col, smoothstep(0.0, 9.0, d));
            // Wellen, die zum Strand laufen
            float wave = sin(d * 1.3 + uT * 2.2 + sin(vXZ.x * 0.15 + vXZ.y * 0.12) * 1.5);
            float foam = smoothstep(0.86, 1.0, wave) * (1.0 - smoothstep(1.0, 7.0, d));
            float edge = 1.0 - smoothstep(0.0, 0.9 + sin(uT * 1.7 + vXZ.x * 0.4 + vXZ.y * 0.3) * 0.35, d);
            col = mix(col, vec3(1.0), clamp(foam * 0.8 + edge * 0.9, 0.0, 1.0));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.perRound.push(this.waterMat);
    flat(add(this.g.plane, this.waterMat, W / 2, -0.4, W / 2, 1800, 1800, 1)).receiveShadow = false;
    add(this.g.box, this.m.sandBase, W / 2, -0.62, W / 2, W, 1.2, W, world, false);
    const tex = this.groundTexture(game);
    const groundMat = new THREE.MeshToonMaterial({ map: tex, gradientMap: this.gradient });
    this.perRound.push(tex, groundMat);
    flat(add(this.g.plane, groundMat, W / 2, 0, W / 2, W, W, 1));

    // Häuser
    const floorTex = canvasTexture(128, 128, (c) => {
      c.fillStyle = '#c99c66';
      c.fillRect(0, 0, 128, 128);
      c.strokeStyle = '#a97c4a';
      c.lineWidth = 3;
      for (let y = 0; y < 128; y += 21) { c.beginPath(); c.moveTo(0, y); c.lineTo(128, y); c.stroke(); }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(3, 3);
    const floorMat = new THREE.MeshToonMaterial({ map: floorTex, gradientMap: this.gradient });
    this.perRound.push(floorTex, floorMat);
    game.houses.forEach((h, i) => {
      const s = h.s * S;
      flat(add(this.g.plane, floorMat, h.x * S, 0.03, h.y * S, s, s, 1));
      const wallMat = new THREE.MeshToonMaterial({ color: C.walls[i % C.walls.length], gradientMap: this.gradient });
      const roofMat = new THREE.MeshToonMaterial({ color: C.roofs[i % C.roofs.length], gradientMap: this.gradient });
      const trimMat = new THREE.MeshToonMaterial({ color: C.trim, gradientMap: this.gradient });
      const chimMat = new THREE.MeshToonMaterial({ color: 0x9c6a52, gradientMap: this.gradient });
      this.perRound.push(wallMat, roofMat, trimMat, chimMat);
      const roof = new THREE.Group();
      add(this.g.box, trimMat, 0, WALL_H + 0.12, 0, s + 0.6, 0.24, s + 0.6, roof);
      add(this.g.gable, roofMat, 0, WALL_H + 0.24, 0, s + 0.8, 3.6, s + 0.8, roof).rotation.y = Math.PI / 2;
      add(this.g.box, chimMat, s * 0.22, WALL_H + 2.6, s * 0.18, 0.7, 1.8, 0.7, roof);
      roof.position.set(h.x * S, 0, h.y * S);
      world.add(roof);
      this.houses.push({ roof, roofMats: [trimMat, roofMat, chimMat], wallMat, fade: 1 });
    });

    // Lichtschein aus den Hauseingängen
    if (!this.doorTex) {
      // Bodenlicht: hell an der Tür, nach außen breiter und durchsichtig
      this.doorTex = canvasTexture(128, 128, (c) => {
        const g = c.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0, 'rgba(255,214,120,0.95)');
        g.addColorStop(0.45, 'rgba(255,196,90,0.45)');
        g.addColorStop(1, 'rgba(255,180,70,0)');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(34, 0); c.lineTo(94, 0); c.lineTo(126, 128); c.lineTo(2, 128);
        c.closePath();
        c.fill();
        // weiche Seitenränder
        c.globalCompositeOperation = 'destination-out';
        const side = c.createLinearGradient(0, 0, 128, 0);
        side.addColorStop(0, 'rgba(0,0,0,0.9)'); side.addColorStop(0.22, 'rgba(0,0,0,0)');
        side.addColorStop(0.78, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,0.9)');
        c.fillStyle = side;
        c.fillRect(0, 0, 128, 128);
      });
      // Leuchten im Türrahmen: unten hell, nach oben ausblendend
      this.doorGlowTex = canvasTexture(64, 64, (c) => {
        const g = c.createLinearGradient(0, 64, 0, 0);
        g.addColorStop(0, 'rgba(255,220,140,0.85)');
        g.addColorStop(1, 'rgba(255,200,110,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, 64, 64);
      });
    }
    const floorLight = new THREE.MeshBasicMaterial({ map: this.doorTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const frameLight = new THREE.MeshBasicMaterial({ map: this.doorGlowTex!, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.perRound.push(floorLight, frameLight);
    this.doorLights = [];
    for (const h of game.houses) {
      for (const d of h.doors) {
        const ang = Math.atan2(d.ny, d.nx);
        const len = 4.2, wid = 5.6;
        const fl = new THREE.Mesh(this.g.plane, floorLight);
        // helles Ende der Textur zeigt zur Tür
        fl.rotation.set(-Math.PI / 2, 0, Math.atan2(d.nx, d.ny));
        fl.position.set(d.x * S + d.nx * len / 2, 0.05, d.y * S + d.ny * len / 2);
        fl.scale.set(wid, len, 1);
        fl.renderOrder = 1;
        world.add(fl);
        const gl = new THREE.Mesh(this.g.plane, frameLight);
        gl.rotation.y = -ang + Math.PI / 2;
        gl.position.set(d.x * S + d.nx * 0.05, 1.0, d.y * S + d.ny * 0.05);
        gl.scale.set(4.2, 2.0, 1);
        world.add(gl);
        this.doorLights.push(fl, gl);
      }
    }

    // Dorfbrunnen
    const t = game.map.town;
    add(this.g.cyl, this.m.rock, t.x * S, 0.4, t.y * S, 2.2, 0.8, 2.2);
    flat(add(this.g.circle, this.waterMat, t.x * S, 0.82, t.y * S, 1.9, 1.9, 1));

    // statische Objekte werden pro Material zu einem einzigen Mesh zusammengefasst (weniger Draw-Calls)
    const staticParts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const waterParts: { x: number; z: number; r: number }[] = [];
    const tmp = new THREE.Object3D();
    const sadd = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rot?: THREE.Euler) => {
      tmp.position.set(x, y, z);
      tmp.scale.set(sx, sy, sz);
      tmp.rotation.copy(rot ?? new THREE.Euler());
      tmp.updateMatrix();
      const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(tmp.matrix);
      const list = staticParts.get(mat) ?? [];
      list.push(g);
      staticParts.set(mat, list);
    };
    for (const o of game.obstacles) {
      const x = o.x * S, z = o.y * S;
      switch (o.kind) {
        case 'wall': {
          const hi = game.houseAt(o.x, o.y);
          add(this.g.box, hi >= 0 ? this.houses[hi].wallMat : this.m.white, x, WALL_H / 2, z, o.w * S, WALL_H, o.h * S);
          // Fenster auf der Außenseite längerer Wandstücke
          const horizW = o.w > o.h, len = (horizW ? o.w : o.h) * S;
          if (hi >= 0 && len > 3.6) {
            const h = game.houses[hi];
            const outer = horizW ? Math.sign(o.y - h.y) : Math.sign(o.x - h.x);
            const t = (horizW ? o.h : o.w) * S / 2 + 0.03;
            const wx = x + (horizW ? 0 : outer * t), wz = z + (horizW ? outer * t : 0);
            const isInner = Math.abs(horizW ? o.y - h.y : o.x - h.x) < h.s / 2 - 40;
            if (!isInner) {
              sadd(this.g.box, this.m.white, wx, 1.22, wz, horizW ? 1.35 : 0.08, 0.95, horizW ? 0.08 : 1.35);
              sadd(this.g.box, this.m.windowGlass, wx + (horizW ? 0 : outer * 0.02), 1.22, wz + (horizW ? outer * 0.02 : 0), horizW ? 1.1 : 0.06, 0.72, horizW ? 0.06 : 1.1);
              sadd(this.g.box, this.m.white, wx + (horizW ? 0 : outer * 0.04), 1.22, wz + (horizW ? outer * 0.04 : 0), horizW ? 0.07 : 0.05, 0.72, horizW ? 0.05 : 0.07);
            }
          }
          break;
        }
        case 'rock': {
          const r = o.r * S;
          sadd(this.g.rock, this.m.rock, x, r * 0.42, z, r, r * 0.78, r, new THREE.Euler(Math.random() * 0.6, Math.random() * 6, Math.random() * 0.6));
          break;
        }
        case 'tree': {
          sadd(this.g.trunk, this.m.trunk, x, 1.1, z, 1, 2.2, 1);
          const mats = [this.m.leaves0, this.m.leaves1, this.m.leaves2];
          const mat = mats[Math.floor(Math.random() * 3)];
          const big = add(this.g.blob, mat, x, 3.2, z, 2.1, 1.7, 2.1);
          const top = add(this.g.blob, mat, x + 0.3, 4.3, z - 0.25, 1.4, 1.2, 1.4);
          this.canopies.push({ meshes: [big, top], x: o.x, y: o.y, r: 50, faded: false, normal: mat, fade: this.m.leavesFade, wobble: 0, base: [] });
          break;
        }
        case 'crate':
        case 'chest':
          this.makeContainer(o, world);
          break;
        case 'water':
          // Flusswasser wird unten aus den Fluss-Daten gezeichnet (inkl. unter den Brücken)
          if (o.r !== game.map.river.width / 2) waterParts.push({ x, z, r: o.r * S });
          break;
        case 'fence': {
          const horiz = o.w > o.h;
          const L = (horiz ? o.w : o.h) * S;
          const n = Math.max(2, Math.round(L / 1.1));
          for (let i = 0; i <= n; i++) {
            const off = -L / 2 + (i / n) * L;
            sadd(this.g.box, this.m.fence, x + (horiz ? off : 0), 0.55, z + (horiz ? 0 : off), 0.16, 1.1, 0.16);
          }
          for (const y of [0.42, 0.84]) sadd(this.g.box, this.m.fence, x, y, z, horiz ? L : 0.07, 0.1, horiz ? 0.07 : L);
          break;
        }
        case 'barrel': {
          const mat = Math.random() < 0.6 ? this.m.barrelRed : this.m.barrelBlue;
          const r = o.r * S;
          sadd(this.g.cyl, mat, x, 0.72, z, r, 1.44, r);
          sadd(this.g.cyl, this.m.barrelBand, x, 0.38, z, r * 1.04, 0.09, r * 1.04);
          sadd(this.g.cyl, this.m.barrelBand, x, 1.06, z, r * 1.04, 0.09, r * 1.04);
          break;
        }
        case 'hay': {
          sadd(this.g.box, this.m.hay, x, 0.62, z, o.w * S, 1.24, o.h * S);
          sadd(this.g.box, this.m.hayDark, x - o.w * S * 0.25, 0.62, z, 0.1, 1.27, o.h * S + 0.03);
          sadd(this.g.box, this.m.hayDark, x + o.w * S * 0.25, 0.62, z, 0.1, 1.27, o.h * S + 0.03);
          break;
        }
      }
    }

    for (const w of game.map.river.water) waterParts.push({ x: w.x * S, z: w.y * S, r: (game.map.river.width / 2) * S });
    // Fluss und Teiche: alle Wasserscheiben in ein Mesh
    if (waterParts.length) {
      const geos = waterParts.map((w) => {
        const g = new THREE.CircleGeometry(1, 28).toNonIndexed();
        g.rotateX(-Math.PI / 2);
        g.scale(w.r, 1, w.r);
        g.translate(w.x, 0.04, w.z);
        return g;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (merged) { this.perRound.push(merged); world.add(new THREE.Mesh(merged, this.waterMat)); }
    }
    // Holzbrücken über den Fluss
    const plankTex = canvasTexture(128, 128, (c) => {
      c.fillStyle = '#b07c48'; c.fillRect(0, 0, 128, 128);
      c.strokeStyle = '#7f5530'; c.lineWidth = 4;
      for (let x = 0; x <= 128; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 128); c.stroke(); }
    });
    plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
    plankTex.repeat.set(6, 1);
    const deckMat = new THREE.MeshToonMaterial({ map: plankTex, gradientMap: this.gradient });
    this.perRound.push(plankTex, deckMat);
    for (const b of game.map.river.bridges) {
      const grp = new THREE.Group();
      grp.position.set(b.x * S, 0, b.y * S);
      grp.rotation.y = -(b.angle + Math.PI / 2);
      const L = (game.map.river.width + 150) * S, Wd = 6.2;
      add(this.g.box, deckMat, 0, -0.06, 0, L, 0.24, Wd, grp);
      for (const side of [Wd / 2 - 0.15, -Wd / 2 + 0.15]) {
        for (let i = 0; i <= 6; i++) add(this.g.box, this.m.bridgeRail, -L / 2 + (i / 6) * L, 0.45, side, 0.18, 0.9, 0.18, grp);
        add(this.g.box, this.m.bridgeRail, 0, 0.88, side, L, 0.12, 0.16, grp);
      }
      world.add(grp);
    }
    // hohe Grasfelder: viele Halme als InstancedMesh, wiegen sich im Wind
    for (const gf of game.map.grass) {
      const R = gf.r * S;
      const n = Math.min(900, Math.floor((Math.PI * R * R) / 0.32));
      const inst = new THREE.InstancedMesh(this.g.blade, this.m.grassBlade, n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * R;
        ps.set(gf.x * S + Math.cos(a) * rr, 0, gf.y * S + Math.sin(a) * rr);
        q.setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.3, Math.random() * 6, (Math.random() - 0.5) * 0.3));
        const h = 1.2 + Math.random() * 0.7 * (1 - (rr / R) * 0.5);
        sc.set(1, h, 1);
        m4.compose(ps, q, sc);
        inst.setMatrixAt(i, m4);
        inst.setColorAt(i, col.setHex(Math.random() < 0.5 ? 0x6cbf4a : 0x58a83e));
      }
      inst.castShadow = false;
      inst.receiveShadow = true;
      world.add(inst);
      this.perRound.push(inst);
    }

    for (const [mat, geos] of staticParts) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      this.perRound.push(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      world.add(mesh);
    }

    for (const b of game.bushes) {
      const x = b.x * S, z = b.y * S, r = b.r * S * 1.15;
      const parts = [
        add(this.g.blob, this.m.bush, x, 0.85, z, r * 0.74, r * 0.62, r * 0.74),
        add(this.g.blob, this.m.bush, x - r * 0.42, 0.7, z + r * 0.24, r * 0.52, r * 0.47, r * 0.52),
        add(this.g.blob, this.m.bush, x + r * 0.42, 0.74, z - r * 0.18, r * 0.54, r * 0.5, r * 0.54),
      ];
      this.bushes.push({ meshes: parts, x: b.x, y: b.y, r: b.r, faded: false, normal: this.m.bush, fade: this.m.bushFade, wobble: 0, base: parts.map((p) => p.scale.clone()) });
    }

    for (const l of game.loot) this.addLoot(l, false);
    for (const f of game.fighters) this.addFighter(f, game.mode !== 'solo' && !f.isPlayer && f.team === game.player.team);

    // Zone
    this.zoneMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uC: { value: new THREE.Vector2() }, uR: { value: 0 }, uN: { value: new THREE.Vector2() }, uNR: { value: 0 } },
      vertexShader: `varying vec2 vXZ; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vXZ = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec2 uC; uniform float uR; uniform vec2 uN; uniform float uNR; varying vec2 vXZ;
        void main(){
          float d = distance(vXZ, uC);
          vec4 col = vec4(0.0);
          if (d > uR) col = vec4(0.22, 0.32, 0.9, 0.32);
          float edge = 1.0 - smoothstep(0.0, 0.3, abs(d - uR));
          col = mix(col, vec4(0.65, 0.82, 1.0, 0.95), edge);
          if (uNR > 0.0) { float nl = 1.0 - smoothstep(0.0, 0.16, abs(distance(vXZ, uN) - uNR)); col = mix(col, vec4(1.0), nl * 0.85); }
          if (col.a < 0.01) discard;
          gl_FragColor = col;
        }`,
    });
    this.perRound.push(this.zoneMat);
    const zp = flat(add(this.g.plane, this.zoneMat, W / 2, 0.07, W / 2, W + 600, W + 600, 1));
    zp.renderOrder = 2;
    zp.receiveShadow = false;
    this.wallMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uT; varying vec2 vUv;
        void main(){
          float a = (1.0 - vUv.y) * 0.45;
          float stripe = step(0.5, fract(vUv.x * 160.0 + vUv.y * 4.0 - uT * 0.6)) * 0.08;
          gl_FragColor = vec4(0.35, 0.55, 1.0, a + stripe * (1.0 - vUv.y));
        }`,
    });
    this.perRound.push(this.wallMat);
    const zg = new THREE.CylinderGeometry(1, 1, 10, 96, 1, true);
    this.perRound.push(zg);
    this.zoneWall = new THREE.Mesh(zg, this.wallMat);
    this.zoneWall.renderOrder = 3;
    world.add(this.zoneWall);

    // Ziellinie
    this.aimMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uCol: { value: new THREE.Color(0xffffff) }, uLen: { value: 20 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uLen; varying vec2 vUv;
        void main(){
          // runde Punkte im Abstand von 0.8 Einheiten
          float gap = 0.8;
          float along = vUv.x * uLen;
          float fx = (fract(along / gap) - 0.5) * gap;
          float fy = (vUv.y - 0.5) * 0.4;
          float d = length(vec2(fx, fy));
          float dot = 1.0 - smoothstep(0.09, 0.12, d);
          float a = dot * (0.95 - vUv.x * 0.35);
          if (a < 0.01) discard;
          gl_FragColor = vec4(uCol, a);
        }`,
    });
    this.perRound.push(this.aimMat);
    const ag = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0).rotateX(-Math.PI / 2);
    this.perRound.push(ag);
    this.aimLine = new THREE.Mesh(ag, this.aimMat);
    this.aimLine.renderOrder = 4;
    world.add(this.aimLine);

    this.buildPlane(world);

    this.playerRing = flat(add(this.g.ring, this.m.playerRing, 0, 0.06, 0, 1.15, 1.15, 1));
    this.playerRing.receiveShadow = false;
  }

  private buildPlane(world: THREE.Group) {
    const pl = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent: THREE.Object3D = pl) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    add(this.g.capsuleX, this.m.planeBody, 0, 0, 0, 1.15, 1.15, 1.15);
    add(this.g.box, this.m.planeAccent, 0, -0.1, 1.14, 7.6, 0.4, 0.06);
    add(this.g.box, this.m.planeAccent, 0, -0.1, -1.14, 7.6, 0.4, 0.06);
    const cockpit = add(this.g.dome, this.m.glass, 3.3, 0.45, 0, 1.25, 1.2, 0.85);
    cockpit.rotation.z = -0.3;
    add(this.g.coneX, this.m.planeAccent, 4.95, 0, 0, 1.0, 0.9, 0.9);
    add(this.g.box, this.m.planeBody, 0.6, -0.25, 0, 2.6, 0.24, 16);
    add(this.g.box, this.m.planeAccent, 0.6, -0.24, 7.6, 2.62, 0.26, 1.0);
    add(this.g.box, this.m.planeAccent, 0.6, -0.24, -7.6, 2.62, 0.26, 1.0);
    this.props = [];
    for (const z of [3.7, -3.7]) {
      add(this.g.cylX, this.m.planeDark, 1.1, -0.55, z, 2.6, 0.58, 0.58);
      add(this.g.coneX, this.m.metal2, 2.5, -0.55, z, 0.4, 0.3, 0.3);
      const prop = new THREE.Group();
      prop.position.set(2.55, -0.55, z);
      add(this.g.box, this.m.planeDark, 0, 0, 0, 0.06, 3.0, 0.24, prop);
      add(this.g.box, this.m.planeDark, 0, 0, 0, 0.06, 0.24, 3.0, prop);
      pl.add(prop);
      this.props.push(prop);
    }
    add(this.g.box, this.m.planeBody, -4.6, 1.4, 0, 1.9, 2.4, 0.18);
    add(this.g.box, this.m.planeAccent, -4.9, 2.4, 0, 1.3, 0.6, 0.2);
    add(this.g.box, this.m.planeBody, -4.6, 0.35, 0, 1.4, 0.16, 5.4);
    pl.scale.setScalar(1.15);
    world.add(pl);
    this.plane = pl;
  }

  // ---------- Effekte ----------

  private near(x: number, y: number, m = 45) {
    return Math.abs(x * S - this.camTarget.x) < m && Math.abs(y * S - this.camTarget.z) < m;
  }

  private puff(x: number, y: number, z: number, mat: THREE.Material, size: number, grow: number, life: number, vx = 0, vy = 0, vz = 0) {
    let p = this.puffs.find((q) => q.life <= 0 && q.mesh.material === mat);
    if (!p) {
      if (this.puffs.length > 400) return;
      const mesh = new THREE.Mesh(this.g.puff, mat);
      this.world!.add(mesh);
      p = { mesh, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, grow: 1 };
      this.puffs.push(p);
    }
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = p.max = life;
    p.size = size;
    p.grow = grow;
    p.mesh.scale.setScalar(size);
  }

  private burst(x: number, y: number, h: number, color: number, n: number, speed: number) {
    if (!this.near(x, y)) return;
    for (let i = 0; i < n; i++) {
      let p = this.particles.find((q) => q.life <= 0);
      if (!p) {
        if (this.particles.length > 240) return;
        const mat = new THREE.MeshBasicMaterial({ color });
        this.perRound.push(mat);
        const mesh = new THREE.Mesh(this.g.particle, mat);
        this.world!.add(mesh);
        p = { mesh, mat, vx: 0, vy: 0, vz: 0, life: 0, max: 1 };
        this.particles.push(p);
      }
      p.mat.color.setHex(color);
      p.mesh.visible = true;
      p.mesh.position.set(x * S, h, y * S);
      const a = Math.random() * Math.PI * 2, sp = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * sp;
      p.vz = Math.sin(a) * sp;
      p.vy = 2 + Math.random() * 5;
      p.max = p.life = 0.35 + Math.random() * 0.35;
    }
  }

  private addTimed(obj: THREE.Object3D, life: number, update: (t: number) => void) {
    this.world!.add(obj);
    this.timed.push({ obj, life, max: life, update });
  }

  private explosion(x: number, y: number, r: number) {
    const px = x * S, pz = y * S;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending });
    this.perRound.push(mat);
    const ball = new THREE.Mesh(this.g.flash, mat);
    ball.position.set(px, 1, pz);
    this.addTimed(ball, 0.45, (t) => {
      ball.scale.setScalar(0.5 + (1 - t) * r * S * 1.1);
      mat.opacity = t;
    });
    const scorch = new THREE.Mesh(this.g.circle, this.m.scorch);
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.set(px, 0.05, pz);
    scorch.scale.setScalar(r * S * 0.7);
    this.addTimed(scorch, 8, (t) => scorch.scale.setScalar(r * S * 0.7 * Math.min(1, t * 3)));
    this.burst(x, y, 1, 0xffa040, 18, 9);
    this.burst(x, y, 1, 0x555555, 10, 6);
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * S * 0.6;
      this.puff(px + Math.cos(a) * d, 0.8 + Math.random(), pz + Math.sin(a) * d, i < 4 ? this.m.fire : this.m.darkSmoke, 0.8 + Math.random() * 0.6, 1.6, 0.9 + Math.random() * 0.6, Math.cos(a) * 1.5, 1.5 + Math.random() * 2, Math.sin(a) * 1.5);
    }
    const dist = Math.hypot(px - this.camTarget.x, pz - this.camTarget.z);
    this.shake = Math.max(this.shake, Math.max(0, 0.9 - dist / 40));
  }

  // ---------- Ereignisse ----------

  handle(events: GameEvent[], game: Game) {
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const st = SHOT[e.wid];
          const v = this.fighterViews.get(e.f);
          if (v) v.recoil = 1;
          if (this.near(e.x, e.y)) {
            const m = new THREE.Mesh(this.g.flash, this.m.flash);
            m.position.set(e.x * S, e.f.weapon.twoHanded ? 1.3 : 1.42, e.y * S);
            const sz = st.flash * 0.32;
            this.addTimed(m, 0.07, (t) => m.scale.setScalar(sz * (0.6 + t)));
            if (e.wid === 'sniper') {
              const len = game.rayLength(e.x, e.y, e.angle, WEAPONS.sniper.range) * S;
              const mat = new THREE.MeshBasicMaterial({ color: 0xf3b0ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
              this.perRound.push(mat);
              const trail = new THREE.Mesh(this.g.box, mat);
              trail.scale.set(len, 0.08, 0.08);
              trail.position.set(e.x * S + Math.cos(e.angle) * len / 2, 1.3, e.y * S + Math.sin(e.angle) * len / 2);
              trail.rotation.y = -e.angle;
              this.addTimed(trail, 0.4, (t) => { mat.opacity = t * 0.8; trail.scale.y = trail.scale.z = 0.04 + t * 0.08; });
            }
            if (e.wid === 'shotgun' || e.wid === 'rocket') {
              for (let i = 0; i < 3; i++) this.puff(e.x * S, 1.3, e.y * S, this.m.smoke, 0.25, 1.4, 0.5, Math.cos(e.angle) * 2, 0.6, Math.sin(e.angle) * 2);
            }
          }
          if (e.f === game.player) this.shake = Math.max(this.shake, st.shake);
          break;
        }
        case 'hit':
          this.burst(e.x, e.y, 1.1, e.color, e.big ? 6 : 3, 4);
          break;
        case 'punch': {
          const v = this.fighterViews.get(e.f);
          if (v) { v.punchT = 1; v.punchArm = v.punchArm ? 0 : 1; }
          if (e.f === game.player && e.hit) this.shake = Math.max(this.shake, 0.12);
          break;
        }
        case 'kill':
          this.burst(e.f.x, e.f.y, 1.0, e.f.color, 18, 7);
          break;
        case 'explode':
          this.explosion(e.x, e.y, e.r);
          break;
        case 'loot':
          this.addLoot(e.loot, true);
          break;
        case 'take': {
          const v = this.lootViews.get(e.loot.id);
          if (v) {
            this.world!.remove(v.root);
            this.lootViews.delete(e.loot.id);
          }
          break;
        }
        case 'crate': {
          const v = this.crateViews.get(e.o.id);
          if (v) {
            v.openT = 0.0001;
            v.glow.visible = false;
            v.body.rotation.z = 0;
          }
          if (this.near(e.o.x, e.o.y)) {
            const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
            this.perRound.push(mat);
            const fl = new THREE.Mesh(this.g.flash, mat);
            fl.position.set(e.o.x * S, 1.3, e.o.y * S);
            this.addTimed(fl, 0.35, (t) => { fl.scale.setScalar(0.4 + (1 - t) * 1.8); mat.opacity = t * 0.8; });
            for (let i = 0; i < 10; i++) {
              const a = Math.random() * Math.PI * 2;
              this.puff(e.o.x * S, 1.2, e.o.y * S, this.m.sparkle, 0.08, 0.2, 0.7, Math.cos(a) * 2.5, 3 + Math.random() * 2, Math.sin(a) * 2.5);
            }
            // goldene Lichtsäule steigt aus der offenen Kiste
            const bm = new THREE.MeshBasicMaterial({ color: e.o.kind === 'airdrop' ? 0xffb060 : 0xffd27a, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
            this.perRound.push(bm);
            const col = new THREE.Mesh(this.g.beam, bm);
            col.position.set(e.o.x * S, 0.9, e.o.y * S);
            this.addTimed(col, 0.7, (t) => { const k = 1 - t; col.scale.set(1.6 + k * 0.8, 0.2 + k * 5, 1.6 + k * 0.8); col.position.y = 0.9 + col.scale.y / 2; bm.opacity = t * 0.6; });
          }
          break;
        }
        case 'damage': {
          const v = this.fighterViews.get(e.f);
          if (v) v.flash = 1;
          if (e.shield && e.byPlayer) this.burst(e.f.x, e.f.y, 1.2, 0x5fb4ff, 5, 4);
          if (e.toPlayer) this.shake = Math.max(this.shake, 0.15);
          break;
        }
        case 'land':
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            this.puff(e.f.x * S, 0.3, e.f.y * S, this.m.dust, 0.35, 1.8, 0.7, Math.cos(a) * 3, 0.5, Math.sin(a) * 3);
          }
          break;
        case 'airdrop':
          this.addDrop(e.d);
          break;
        case 'airdropLand': {
          const v = this.dropViews.get(e.d.id);
          if (v) {
            v.landed = true;
            this.world!.remove(v.root);
          }
          if (e.d.obstacle) this.makeContainer(e.d.obstacle, this.world!);
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            this.puff(e.d.x * S, 0.4, e.d.y * S, this.m.dust, 0.5, 2, 0.9, Math.cos(a) * 4, 0.6, Math.sin(a) * 4);
          }
          break;
        }
      }
    }
  }

  private addDrop(d: Airdrop) {
    const root = new THREE.Group();
    const s = 56 * S;
    const add = (mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
      const m = new THREE.Mesh(this.g.box, mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = true;
      root.add(m);
    };
    add(this.m.dropBody, 0, 0.9, 0, s, 1.8, s);
    add(this.m.dropStripe, 0, 0.9, 0, s + 0.05, 0.3, s + 0.05);
    const chute = this.makeChute(0xff8a1e, 3.4, 1.8);
    root.add(chute);
    this.world!.add(root);
    this.dropViews.set(d.id, { root, chute, smokeT: 0, landed: false });
  }

  // ---------- Bild ----------

  render(game: Game, dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    this.time += dt;
    const p = game.player;
    const playerHouse = p.alive && p.phase === 'ground' ? game.houseAt(p.x, p.y) : -1;

    for (const f of game.fighters) this.updateFighter(f, game, dt, playerHouse);

    this.playerRing.visible = p.alive && p.phase === 'ground';
    this.playerRing.position.set(p.x * S, 0.06, p.y * S);
    this.playerRing.rotation.z = this.time;

    // Ziellinie des Spielers
    const aiming = p.alive && p.phase === 'ground' && !p.downed && p.weapon.id !== 'fists' && game.input.aim !== null && !game.over;
    this.aimLine.visible = aiming;
    if (aiming) {
      // Ziellinie zeigt zur Maus / zum rechten Stick, auch wenn die Figur in Laufrichtung schaut
      const aimA = game.input.aim ?? p.aim;
      const len = game.rayLength(p.x, p.y, aimA, p.weapon.range) * S;
      this.aimLine.position.set(p.x * S + Math.cos(aimA) * 0.9, 0.12, p.y * S + Math.sin(aimA) * 0.9);
      this.aimLine.rotation.y = -aimA;
      const l = Math.max(0.5, len - 0.9);
      this.aimLine.scale.set(l, 1, 0.4);
      this.aimMat.uniforms.uLen.value = l;
    }

    this.updateBullets(game, dt);
    this.updateProgress(game);
    this.updateReloadRing(game);
    this.updateReviveRing(game);
    this.updateLootAndContainers(dt);
    this.updateEffects(dt);
    this.updateFades(game, dt, playerHouse);

    // Versorgungspakete im Fall
    for (const d of game.airdrops) {
      const v = this.dropViews.get(d.id);
      if (v && !v.landed) {
        v.root.position.set(d.x * S, d.z * S, d.y * S);
        v.root.rotation.z = Math.sin(this.time * 1.4 + d.id) * 0.06;
      }
      if (d.obstacle && !d.obstacle.opened && this.near(d.x, d.y, 60)) {
        v && (v.smokeT -= dt);
        if (v && v.smokeT <= 0) {
          v.smokeT = 0.12;
          this.puff(d.x * S + 1, 2, d.y * S + 1, this.m.orangeSmoke, 0.4, 2.2, 2.2, 0.3, 2.2, -0.2);
        }
      }
    }

    // Zone
    const zc = game.zoneCur, zn = game.zoneNext;
    this.zoneMat.uniforms.uC.value.set(zc.x * S, zc.y * S);
    this.zoneMat.uniforms.uR.value = zc.r * S;
    this.zoneMat.uniforms.uN.value.set(zn.x * S, zn.y * S);
    this.zoneMat.uniforms.uNR.value = game.zoneState !== 'done' ? zn.r * S : 0;
    this.wallMat.uniforms.uT.value = this.time;
    this.waterMat.uniforms.uT.value = this.time;
    this.windTime.value = this.time;
    if (this.doorLights.length) {
      const k = 0.85 + Math.sin(this.time * 2.2) * 0.15;
      (this.doorLights[0].material as THREE.MeshBasicMaterial).opacity = k;
      if (this.doorLights[1]) (this.doorLights[1].material as THREE.MeshBasicMaterial).opacity = k;
    }
    this.zoneWall.position.set(zc.x * S, 5, zc.y * S);
    this.zoneWall.scale.set(Math.max(0.01, zc.r * S), 1, Math.max(0.01, zc.r * S));

    // Flugzeug
    const t = game.time / PLANE_TIME;
    const pp = game.plane;
    this.plane.visible = t < 1.3;
    if (this.plane.visible) {
      const ang = Math.atan2(pp.y2 - pp.y1, pp.x2 - pp.x1);
      this.plane.position.set(lerp(pp.x1, pp.x2, t) * S, PLANE_Z * S, lerp(pp.y1, pp.y2, t) * S);
      this.plane.rotation.set(Math.sin(this.time * 1.5) * 0.05, -ang, 0);
      for (const pr of this.props) pr.rotation.x += dt * 40;
      this.contrailT -= dt;
      if (this.contrailT <= 0) {
        this.contrailT = 0.05;
        const back = -2;
        for (const side of [8.6, -8.6]) {
          const c = Math.cos(ang), s = Math.sin(ang);
          const wx = this.plane.position.x + c * back - s * side, wz = this.plane.position.z + s * back + c * side;
          this.puff(wx, PLANE_Z * S - 0.3, wz, this.m.contrail, 0.22, 0.7, 1.1);
        }
      }
    }

    this.updateCamera(game, dt);
    this.updateSun();
    this.renderer.render(this.scene, this.camera);
  }

  private updateFighter(f: Fighter, game: Game, dt: number, playerHouse: number) {
    const v = this.fighterViews.get(f);
    if (!v) return;
    const rig = v.rig;
    if (v.weaponId !== f.weapon.id) {
      rig.gunKick.clear();
      rig.gunKick.add(this.makeGun(f.weapon.id));
      v.spin = rig.gunKick.getObjectByName('spin') ?? null;
      v.weaponId = f.weapon.id;
    }
    if (!f.alive) {
      // umfallen (0,45 s), liegen bleiben, dann im Boden versinken (gesamt ~2,8 s)
      if (v.root.visible) {
        v.deadT += dt;
        const fall = Math.min(1, v.deadT / 0.45);
        const ease = fall < 1 ? 1 - Math.pow(1 - fall, 3) : 1;
        const bounce = fall >= 1 ? Math.max(0, Math.sin((v.deadT - 0.45) * 18) * 0.06 * Math.max(0, 1 - (v.deadT - 0.45) * 4)) : 0;
        rig.body.rotation.z = ease * (Math.PI / 2) - bounce;
        rig.body.position.y = 0;
        v.lean.rotation.set(0, 0, 0);
        poseLying(rig, 0, false);
        v.chute.visible = false;
        if (v.deadT > 2.2) {
          const sink = Math.min(1, (v.deadT - 2.2) / 0.6);
          v.root.position.y = -sink * 0.9;
          v.root.scale.setScalar(1 - sink * 0.3);
          if (sink >= 1) v.root.visible = false;
        }
      }
      return;
    }
    const house = f.phase === 'ground' ? game.houseAt(f.x, f.y) : -1;
    const inOtherHouse = !f.isPlayer && house !== -1 && house !== playerHouse;
    v.root.visible = f.phase !== 'plane' && !f.hidden && !inOtherHouse;
    v.root.position.set(f.x * S, f.z * S, f.y * S);
    const speed = Math.hypot(f.vx, f.vy);
    const falling = f.phase === 'fall';
    // Blickrichtung: am Fallschirm in Flugrichtung, sonst zur Zielrichtung
    const wantYaw = falling && speed > 40 ? Math.atan2(f.vy, f.vx) : f.aim;
    {
      let d = wantYaw - v.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const maxTurn = (falling ? 3 : f.aiming ? 9 : 6.5) * dt;
      const step = Math.sign(d) * Math.min(Math.abs(d), Math.max(maxTurn * 0.35, Math.abs(d) * (1 - Math.exp(-dt * 10))), maxTurn);
      v.yaw += step;
      d -= step;
      rig.body.rotation.y = -v.yaw;
      rig.head.rotation.y = falling ? 0 : -Math.max(-0.75, Math.min(0.75, d));
    }
    v.chute.visible = falling;
    if (falling) {
      // Schirm dreht mit der Figur und kippt in die Lenkrichtung
      v.chute.rotation.y = -v.yaw;
      v.chute.rotation.x = lerp(v.chute.rotation.x, f.vy * 0.0016, 0.1);
      v.chute.rotation.z = lerp(v.chute.rotation.z, -f.vx * 0.0016 + Math.sin(this.time * 2 + f.id) * 0.04, 0.1);
    }
    if (v.chute.visible && !f.isPlayer) {
      // Schirme anderer Spieler, die nah vor der Kamera schweben, durchsichtig machen
      const dx = f.x * S - this.camTarget.x, dz = f.y * S - this.camTarget.z;
      const near = Math.hypot(dx, dz) < 14 && f.z * S > this.camTarget.y + 4;
      const target = near ? 0.3 : 1;
      const canopy = v.chute.children[0] as THREE.Mesh;
      const mat = canopy.material as THREE.MeshToonMaterial;
      if (Math.abs(mat.opacity - target) > 0.01) {
        mat.transparent = true;
        mat.opacity = lerp(mat.opacity, target, 0.15);
        mat.depthWrite = mat.opacity > 0.95;
      }
    }
    if (!v.root.visible) return;

    // in Laufrichtung lehnen (am Fallschirm deutlich stärker)
    const lk = falling ? 0.0028 : 0.0005;
    v.lean.rotation.x = lerp(v.lean.rotation.x, f.vy * lk, 0.12);
    v.lean.rotation.z = lerp(v.lean.rotation.z, -f.vx * lk, 0.12);

    // niedergeschlagen: auf den Bauch fallen und langsam kriechen
    rig.body.rotation.z = lerp(rig.body.rotation.z, f.downed ? -Math.PI / 2 * 0.92 : 0, 1 - Math.exp(-dt * 8));
    if (f.downed) {
      const crawl = Math.min(1, speed / 40);
      v.walkT += dt * (2 + crawl * 5);
      poseCrawl(rig, v.walkT, crawl);
      rig.body.position.y = 0.22 + Math.abs(Math.sin(v.walkT)) * 0.04 * crawl;
      v.lean.rotation.set(0, 0, 0);
      const pulse = 0.25 + Math.sin(this.time * 6) * 0.15;
      rig.shirtMat.emissive.setRGB(pulse, 0, 0);
      return;
    }

    // Schrittlänge passend zum Tempo: ein Doppelschritt ≈ 3 Einheiten
    v.walkT += (speed * S * dt / 3.0) * Math.PI * 2;
    v.amp = lerp(v.amp, f.moving ? Math.min(1, speed / 150) : 0, 1 - Math.exp(-dt * 8));
    const shooting = f.isPlayer ? game.input.firing || game.time - f.lastShot < 350 : f.aiming || game.time - f.lastShot < 500;
    // hoch in die Schusshaltung geht es schnell, zurück etwas weicher
    v.aimBlend = lerp(v.aimBlend, shooting ? 1 : 0, 1 - Math.exp(-dt * (shooting ? 26 : 9)));
    v.reloadBlend = lerp(v.reloadBlend, f.reloading ? 1 : 0, 1 - Math.exp(-dt * 12));
    rig.head.rotation.z = 0;
    rig.head.rotation.x = 0;
    rig.legs.forEach((l) => { l.hip.rotation.x = 0; l.hip.rotation.y = 0; });
    v.punchT = Math.max(0, v.punchT - dt * 6);
    animateRig(rig, { punch: v.punchT, punchArm: v.punchArm, phase: v.walkT, amp: v.amp, aim: v.aimBlend, twoHanded: f.weapon.twoHanded, weapon: f.weapon.id, reload: v.reloadBlend, time: this.time + f.id, falling });

    v.recoil = Math.max(0, v.recoil - dt * 9);
    rig.gunKick.position.x = -v.recoil * (f.weapon.id === 'shotgun' || f.weapon.id === 'sniper' || f.weapon.id === 'rocket' ? 0.22 : 0.1);
    if (v.spin) v.spin.rotation.x += dt * (game.time - f.lastTrigger < 200 ? 40 : 2);

    // Staubspur beim Laufen
    if (f.moving && f.phase === 'ground' && this.near(f.x, f.y, 35)) {
      v.dustT -= dt * Math.min(1.2, speed / 170);
      if (v.dustT <= 0) {
        v.dustT = 0.13;
        const back = -0.35;
        this.puff(f.x * S + Math.cos(f.aim) * back, 0.12, f.y * S + Math.sin(f.aim) * back, this.m.dust, 0.18, 1.6, 0.55, -f.vx * S * 0.15, 0.5, -f.vy * S * 0.15);
      }
    }

    const em = rig.shirtMat.emissive;
    if (v.flash > 0) {
      v.flash = Math.max(0, v.flash - dt * 9);
      em.setRGB(v.flash, v.flash, v.flash);
    } else if (f.healUntil) {
      em.setRGB(0, 0.25 + Math.sin(this.time * 10) * 0.1, 0);
    } else {
      em.setRGB(0, 0, 0);
    }
  }

  private bulletMesh(wid: WeaponId) {
    const pool = this.bulletPools.get(wid) ?? [];
    this.bulletPools.set(wid, pool);
    let m = pool.pop();
    if (!m) {
      if (wid === 'rocket') {
        const g = new THREE.Group();
        const body = new THREE.Mesh(this.g.cylX, this.m.rocketBody);
        body.scale.set(0.7, 0.1, 0.1);
        const tip = new THREE.Mesh(this.g.coneX, this.m.red);
        tip.scale.set(0.22, 0.1, 0.1);
        tip.position.x = 0.45;
        const fire = new THREE.Mesh(this.g.flash, this.m.fire);
        fire.scale.set(0.25, 0.12, 0.12);
        fire.position.x = -0.45;
        g.add(body, tip, fire);
        m = g;
      } else {
        const st = SHOT[wid];
        const mesh = new THREE.Mesh(this.g.bullet, this.shotMat[wid]);
        mesh.scale.set(st.len, st.thick, st.thick);
        m = mesh;
      }
      m.userData.wid = wid;
      this.world!.add(m);
    }
    m.visible = true;
    return m;
  }

  private updateBullets(game: Game, dt: number) {
    const live = new Set(game.bullets);
    for (const [b, m] of this.bulletViews) {
      if (!live.has(b)) {
        m.visible = false;
        this.bulletPools.get(m.userData.wid as string)!.push(m);
        this.bulletViews.delete(b);
      }
    }
    for (const b of game.bullets) {
      let m = this.bulletViews.get(b);
      if (!m) {
        m = this.bulletMesh(b.wid);
        m.rotation.y = -Math.atan2(b.vy, b.vx);
        this.bulletViews.set(b, m);
      }
      m.position.set(b.x * S, b.owner.weapon.twoHanded ? 1.3 : 1.4, b.y * S);
      if (b.wid === 'rocket' && Math.random() < dt * 40) {
        this.puff(m.position.x, m.position.y, m.position.z, this.m.smoke, 0.2, 1.8, 0.7, 0, 0.4, 0);
      }
    }
  }

  /** Aufhebe-/Öffnungs-Fortschritt: der Ring am Boden füllt sich */
  private updateProgress(game: Game) {
    const p = game.player;
    let target: { x: number; y: number; t: number; r: number; color: number } | null = null;
    if (p.alive && p.phase === 'ground') {
      if (game.pick) {
        const l = game.pick.loot;
        target = { x: l.x, y: l.y, t: game.pick.t / game.pick.total, r: 1.15, color: 0xffffff };
      } else {
        for (const o of game.obstacles) {
          if (!isContainer(o) || o.opened || o.progress <= 0) continue;
          if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 < 130 * 130) {
            target = { x: o.x, y: o.y, t: o.progress, r: Math.max(o.w, o.h) * S * 0.9, color: o.kind === 'airdrop' ? 0xff9a3a : 0xffc93c };
          }
        }
      }
    }
    if (!target || target.t <= 0) {
      if (this.progMesh) this.progMesh.visible = false;
      if (this.progTrack) this.progTrack.visible = false;
      return;
    }
    const container = target.color !== 0xffffff;
    if (!this.progTrack) {
      this.progTrack = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.02, 64), this.progTrackMat);
      this.progTrack.rotation.x = -Math.PI / 2;
      this.progTrack.renderOrder = 4;
    }
    if (this.progTrack.parent !== this.world) this.world!.add(this.progTrack);
    this.progTrack.visible = container;
    this.progTrack.position.set(target.x * S, 0.085, target.y * S);
    this.progTrack.scale.setScalar(target.r);
    const steps = Math.max(1, Math.round(Math.min(1, target.t) * 64));
    const key = `${steps}-${container}`;
    if (!this.progMesh || key !== this.progKey) {
      const inner = container ? 0.9 : 0.74;
      const geo = new THREE.RingGeometry(inner, 1.04, 64, 1, Math.PI / 2, -(steps / 64) * Math.PI * 2);
      if (this.progMesh) {
        this.progMesh.geometry.dispose();
        this.progMesh.geometry = geo;
      } else {
        this.progMesh = new THREE.Mesh(geo, this.progMat);
        this.progMesh.rotation.x = -Math.PI / 2;
        this.progMesh.renderOrder = 5;
      }
      this.progKey = key;
    }
    if (this.progMesh.parent !== this.world) this.world!.add(this.progMesh);
    this.progMesh.visible = true;
    this.progMat.color.setHex(target.color);
    this.progMat.opacity = container ? 0.95 : 0.55;
    this.progMesh.position.set(target.x * S, 0.09, target.y * S);
    this.progMesh.scale.setScalar(target.r);
  }

  private reloadMesh: THREE.Mesh | null = null;
  private reloadStep = -1;
  private reloadMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  private updateReloadRing(game: Game) {
    const p = game.player;
    if (!p.alive || !p.reloading || p.phase !== 'ground') {
      if (this.reloadMesh) this.reloadMesh.visible = false;
      return;
    }
    const t = 1 - Math.max(0, p.reloadUntil - game.time) / p.weapon.reload;
    const steps = Math.max(1, Math.round(t * 48));
    if (!this.reloadMesh || steps !== this.reloadStep) {
      const geo = new THREE.RingGeometry(1.42, 1.56, 48, 1, Math.PI / 2, -(steps / 48) * Math.PI * 2);
      if (this.reloadMesh) { this.reloadMesh.geometry.dispose(); this.reloadMesh.geometry = geo; }
      else { this.reloadMesh = new THREE.Mesh(geo, this.reloadMat); this.reloadMesh.rotation.x = -Math.PI / 2; this.reloadMesh.renderOrder = 5; }
      this.reloadStep = steps;
    }
    if (this.reloadMesh.parent !== this.world) this.world!.add(this.reloadMesh);
    this.reloadMesh.visible = true;
    this.reloadMesh.position.set(p.x * S, 0.08, p.y * S);
  }

  private reviveMesh: THREE.Mesh | null = null;
  private reviveStep = -1;
  private reviveMat = new THREE.MeshBasicMaterial({ color: 0x5dff7a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  private updateReviveRing(game: Game) {
    let target: Fighter | null = null;
    for (const f of game.fighters) {
      if (f.alive && f.downed && f.team === game.player.team && f.reviveT > 0 && (!target || f.reviveT > target.reviveT)) target = f;
    }
    if (!target) { if (this.reviveMesh) this.reviveMesh.visible = false; return; }
    const steps = Math.max(1, Math.round(Math.min(1, target.reviveT / 3.5) * 48));
    if (!this.reviveMesh || steps !== this.reviveStep) {
      const geo = new THREE.RingGeometry(1.3, 1.5, 48, 1, Math.PI / 2, -(steps / 48) * Math.PI * 2);
      if (this.reviveMesh) { this.reviveMesh.geometry.dispose(); this.reviveMesh.geometry = geo; }
      else { this.reviveMesh = new THREE.Mesh(geo, this.reviveMat); this.reviveMesh.rotation.x = -Math.PI / 2; this.reviveMesh.renderOrder = 5; }
      this.reviveStep = steps;
    }
    if (this.reviveMesh.parent !== this.world) this.world!.add(this.reviveMesh);
    this.reviveMesh.visible = true;
    this.reviveMesh.position.set(target.x * S, 0.09, target.y * S);
  }

  private updateLootAndContainers(dt: number) {
    for (const v of this.lootViews.values()) {
      if (v.pop < 1) {
        if (v.from) {
          // aus der Kiste im Bogen zum Landeplatz fliegen
          v.pop = Math.min(1, v.pop + dt * 2.4);
          const t = v.pop, e = 1 - Math.pow(1 - t, 2);
          v.root.position.set(lerp(v.from.x, v.x, e) * S, Math.sin(t * Math.PI) * 2.2 + (1 - t) * 0.9, lerp(v.from.y, v.y, e) * S);
          v.root.scale.setScalar(Math.max(0.01, 0.5 + t * 0.5));
          if (t >= 1) v.root.position.set(v.x * S, 0, v.y * S);
        } else {
          v.pop = Math.min(1, v.pop + dt * 4);
          v.root.scale.setScalar(Math.max(0.01, v.pop * (1 + Math.sin(v.pop * Math.PI) * 0.3)));
        }
      }
      if (this.near(v.x, v.y, 40)) {
        v.item.rotation.y = this.time * 1.6 + v.x;
        v.item.position.y = 0.95 + Math.sin(this.time * 3 + v.y) * 0.12;
      }
    }
    for (const v of this.crateViews.values()) {
      if (v.openT > 0 && v.openT < 1) {
        // Deckel schwingt mit leichtem Überschwingen auf
        v.openT = Math.min(1, v.openT + dt * 2.6);
        const t = v.openT, c = 1.7;
        const back = 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
        v.lid.rotation.x = -back * (v.kind === 'chest' ? 1.75 : 1.9);
        v.body.rotation.z = 0;
        v.body.scale.set(1 + Math.sin(t * Math.PI) * 0.06, 1 - Math.sin(t * Math.PI) * 0.05, 1 + Math.sin(t * Math.PI) * 0.06);
      } else if (v.openT === 0) {
        const pr = v.o.progress;
        v.glow.visible = pr <= 0;
        if (pr > 0 && this.near(v.o.x, v.o.y, 40)) {
          // während des Öffnens: Deckel klappert leicht, Truhe ruckelt
          v.lid.rotation.x = -0.05 - Math.abs(Math.sin(this.time * 26)) * 0.07 * (0.4 + pr);
          v.body.rotation.z = Math.sin(this.time * 31) * 0.015 * pr;
        } else {
          v.lid.rotation.x = 0;
          v.body.rotation.z = 0;
        }
      } else if (v.body.scale.x !== 1) {
        v.body.scale.set(1, 1, 1);
      }
    }
  }

  private updateEffects(dt: number) {
    for (const q of this.particles) {
      if (q.life <= 0) continue;
      q.life -= dt;
      q.vy -= 18 * dt;
      q.mesh.position.x += q.vx * dt;
      q.mesh.position.y = Math.max(0.08, q.mesh.position.y + q.vy * dt);
      q.mesh.position.z += q.vz * dt;
      q.mesh.scale.setScalar(Math.max(0.05, q.life / q.max));
      if (q.life <= 0) q.mesh.visible = false;
    }
    for (const q of this.puffs) {
      if (q.life <= 0) continue;
      q.life -= dt;
      const t = 1 - q.life / q.max;
      q.mesh.position.x += q.vx * dt;
      q.mesh.position.y += q.vy * dt;
      q.mesh.position.z += q.vz * dt;
      q.vx *= 0.96; q.vz *= 0.96;
      // wachsen, am Ende schrumpfen (geteilte Materialien: Ausblenden über Größe)
      q.mesh.scale.setScalar(Math.max(0.01, q.size * (1 + t * q.grow) * (t > 0.6 ? (1 - t) / 0.4 : 1)));
      if (q.life <= 0) q.mesh.visible = false;
    }
    this.timed = this.timed.filter((tm) => {
      tm.life -= dt;
      if (tm.life <= 0) {
        this.world!.remove(tm.obj);
        return false;
      }
      tm.update(tm.life / tm.max);
      return true;
    });
  }

  private updateFades(game: Game, dt: number, playerHouse: number) {
    const p = game.player;
    const fade = (list: FadeView[], k: number) => {
      for (const c of list) {
        const near = p.alive && p.phase === 'ground' && (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < (c.r * k) ** 2;
        if (near !== c.faded) {
          c.faded = near;
          for (const m of c.meshes) {
            m.material = near ? c.fade : c.normal;
            m.castShadow = !near;
          }
        }
      }
    };
    fade(this.canopies, 1.0);
    fade(this.bushes, 1.0);
    // Büsche wackeln, wenn jemand hindurchläuft
    for (const b of this.bushes) {
      if (!this.near(b.x, b.y, 40)) continue;
      for (const f of game.fighters) {
        if (f.alive && f.moving && (f.x - b.x) ** 2 + (f.y - b.y) ** 2 < (b.r * 1.1) ** 2) { b.wobble = 1; break; }
      }
      if (b.wobble > 0) {
        b.wobble = Math.max(0, b.wobble - dt * 2.5);
        const w = Math.sin(this.time * 22) * 0.08 * b.wobble;
        b.meshes.forEach((m, i) => m.scale.set(b.base[i].x * (1 + w), b.base[i].y * (1 - w), b.base[i].z * (1 + w)));
      }
    }
    const hk = 1 - Math.exp(-dt * 8);
    this.houses.forEach((h, i) => {
      const target = i === playerHouse ? 0 : 1;
      if (Math.abs(h.fade - target) < 0.001) return;
      h.fade = lerp(h.fade, target, hk);
      if (Math.abs(h.fade - target) < 0.01) h.fade = target;
      const roofA = h.fade, wallA = 0.35 + h.fade * 0.65;
      for (const m of h.roofMats) {
        m.transparent = roofA < 1;
        m.opacity = roofA;
        m.depthWrite = roofA >= 1;
        m.needsUpdate = true;
      }
      h.roof.visible = roofA > 0.02;
      h.wallMat.transparent = wallA < 1;
      h.wallMat.opacity = wallA;
      h.wallMat.depthWrite = wallA >= 1;
      h.wallMat.needsUpdate = true;
    });
  }

  private updateSun() {
    const t = this.camTarget;
    const o = this.tod.off;
    this.sun.position.set(t.x + o[0], o[1], t.z + o[2]);
    this.sun.target.position.set(t.x, 0, t.z);
  }

  private updateCamera(game: Game, dt: number) {
    const p = game.player;
    let tx: number, ty: number, tz: number, zoom: number;
    const spec = !p.alive && game.spectate ? game.spectate : null;
    if (spec) {
      tx = spec.x * S;
      tz = spec.y * S;
      ty = spec.z * S * 0.4;
      zoom = 1 + Math.min(1, spec.z / PLANE_Z) * 0.8;
    } else if (p.phase === 'plane') {
      tx = this.plane.position.x;
      tz = this.plane.position.z;
      ty = PLANE_Z * S * 0.4;
      zoom = 1.8;
    } else {
      tx = p.x * S;
      tz = p.y * S;
      ty = p.z * S * 0.4;
      zoom = 1 + Math.min(1, p.z / PLANE_Z) * 0.8;
      // beim Zielen etwas in Blickrichtung vorausschauen
      if (game.input.aim !== null && p.phase === 'ground') {
        const look = Math.min(6, p.weapon.range * S * 0.18);
        const la = game.input.aim;
        tx += Math.cos(la) * look;
        tz += Math.sin(la) * look;
      }
    }
    const k = 1 - Math.exp(-dt * 6);
    this.camTarget.x = lerp(this.camTarget.x, tx, k);
    this.camTarget.y = lerp(this.camTarget.y, ty, k);
    this.camTarget.z = lerp(this.camTarget.z, tz, k);
    const air = p.phase === 'plane' ? 1 : Math.min(1, p.z / PLANE_Z);
    this.pitch = lerp(this.pitch, lerp(PITCH, PITCH_AIR, air), k);
    const dist = this.baseDist * zoom;
    this.shake = Math.max(0, this.shake - dt * 3);
    const sx = (Math.random() - 0.5) * this.shake, sz = (Math.random() - 0.5) * this.shake;
    this.camera.position.set(this.camTarget.x + sx, this.camTarget.y + dist * Math.sin(this.pitch), this.camTarget.z + dist * Math.cos(this.pitch) + sz);
    this.camera.lookAt(this.camTarget.x + sx * 0.5, this.camTarget.y, this.camTarget.z + sz * 0.5);
  }

  renderMenu(dtMs: number) {
    const dt = dtMs / 1000;
    this.time += dt;
    const a = this.time * 0.05;
    this.camTarget.set(W / 2, 0, W / 2);
    this.camera.position.set(W / 2 + Math.cos(a) * 60, 42, W / 2 + Math.sin(a) * 60);
    this.camera.lookAt(W / 2, 0, W / 2);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -80;
    sc.right = sc.top = 80;
    sc.updateProjectionMatrix();
    this.updateSun();
    if (this.waterMat) this.waterMat.uniforms.uT.value = this.time;
    this.windTime.value = this.time;
    if (this.plane) this.plane.visible = false;
    if (this.playerRing) this.playerRing.visible = false;
    if (this.aimLine) this.aimLine.visible = false;
    this.renderer.render(this.scene, this.camera);
  }

  resetShadowArea() {
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -38;
    sc.right = sc.top = 38;
    sc.updateProjectionMatrix();
  }

  private v3 = new THREE.Vector3();
  project(x: number, y: number, h: number) {
    this.v3.set(x * S, h, y * S).project(this.camera);
    return {
      x: (this.v3.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.v3.y * 0.5 + 0.5) * window.innerHeight,
      on: this.v3.z < 1 && Math.abs(this.v3.x) < 1.1 && Math.abs(this.v3.y) < 1.1,
    };
  }

  /** Bildschirmpunkt -> Spielwelt (für Maus-Zielen) */
  groundPoint(sx: number, sy: number) {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, hit)) return null;
    return { x: hit.x / S, y: hit.z / S };
  }

  fighterVisible(f: Fighter) {
    const v = this.fighterViews.get(f);
    return !!v && v.root.visible;
  }
}
