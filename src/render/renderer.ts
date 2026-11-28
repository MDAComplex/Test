import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { S, WORLD, PLANE_Z, PLANE_TIME } from '../config';
import { Game, Fighter, GameEvent, Loot, Bullet, Obstacle, Airdrop, isContainer } from '../sim/game';
import { WEAPONS, TIER_COLORS, WeaponId, parseWeapon } from '../weapons';
import { CHUTE_Z, DROP_Z, FREE_BACK } from '../sim/game';
import { buildGun } from './guns';
import { buildItem } from './items';
import type { WrapId } from '../wraps';
import { LootKind, RAIL_R, FOUNTAIN_R, coastPolygon, BEACH_W, ISLAND, ISLETS, landRadius } from '../mapgen';
import { buildGround } from './ground';
import { buildProps } from './props';
import { WHITE_CHUTE } from '../chute';
import { ANIM, buildCharacter, buildChute, animateRig, poseLying, poseCrawl, poseDeath, capturePose, makeToon, Rig, PoseSnap, DeathKind } from './character';

const W = WORLD * S;
const WALL_H = 2.1;
const PITCH = (58 * Math.PI) / 180;
const PITCH_AIR = (74 * Math.PI) / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
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
  /** grauer Bodenschatten (nur am Boden bzw. kurz vor der Landung) */
  shadow: THREE.Mesh;
  /** Beine im Fahrtwind (geglättet): nach hinten / zur Seite */
  legFwd: number;
  legSide: number;
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
  /** 0 = steht, 1 = kniet/kriecht (kurze Übergangsanimation) */
  kneel: number;
  punchArm: 0 | 1;
  /** Öffnen des Fallschirms 0..1 */
  chuteT: number;
  /** Landen: kurzes Stauchen (nur bei lebendigen Animationen) */
  squash?: number;
  /** Haltung beim Tod und Art des Umfallens */
  deathSnap?: PoseSnap;
  deathKind?: DeathKind;
}
interface Particle { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; vx: number; vy: number; vz: number; life: number; max: number }
interface Puff { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number }
interface LootView { root: THREE.Group; item: THREE.Group; pop: number; x: number; y: number; from?: { x: number; y: number }; face?: boolean }
interface CrateView { lid: THREE.Group; glow: THREE.Mesh; openT: number; kind: string; body: THREE.Group; o: Obstacle }
interface FadeView { meshes: THREE.Mesh[]; x: number; y: number; r: number; faded: boolean; normal: THREE.Material; fade: THREE.Material; wobble: number; base: THREE.Vector3[] }
interface HouseView { roof: THREE.Group; roofMats: THREE.Material[]; wallMat: THREE.MeshToonMaterial; fade: number }
interface Timed { obj: THREE.Object3D; life: number; max: number; update: (t: number) => void }
interface DropView { root: THREE.Group; chute: THREE.Group; smokeT: number; landed: boolean }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ring, der stufenlos per Shader gefüllt wird (im Uhrzeigersinn ab oben); kein Neubau der Geometrie pro Bild */
function arcMaterial(color: number, opacity: number) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uProg: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uProg; uniform vec3 uColor; uniform float uOpacity; varying vec2 vP;
      void main(){
        float a = atan(vP.x, vP.y); if (a < 0.0) a += 6.2831853;
        float f = a / 6.2831853;
        float edge = 0.004;
        float k = 1.0 - smoothstep(uProg - edge, uProg + edge, f);
        if (k <= 0.001) discard;
        gl_FragColor = vec4(uColor, uOpacity * k);
      }`,
  });
}

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
  t.anisotropy = 16;
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
  /** Kamera beim nächsten Bild ohne Nachziehen setzen (z. B. beim Absprung) */
  snapCam = false;
  camDist = 0;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  /** Tageszeit der Runde: Licht, Farben, Sonnenrichtung */
  tod = TODS[0];
  private windTime = { value: 0 };
  private shake = 0;

  private fighterViews = new Map<Fighter, FighterView>();
  private flyMode = false;
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
  private riverMat: THREE.ShaderMaterial | null = null;
  private aimMat!: THREE.ShaderMaterial;
  private aimLine!: THREE.Mesh;
  private zoneWall!: THREE.Mesh;
  private plane!: THREE.Group;
  private props: THREE.Object3D[] = [];
  private contrailT = 0;
  private playerRing!: THREE.Mesh;
  /** Ich-Perspektive: von außen gesetzt (Blick + aktiv) */
  fpp = { on: false, yaw: 0, pitch: 0 };
  private fppView: THREE.Group | null = null;
  private fppWeapon = '';
  private fppBob = 0;
  private fppMode = false;
  private doorTex: THREE.CanvasTexture | null = null;
  private doorGlowTex: THREE.CanvasTexture | null = null;
  private doorLights: THREE.Mesh[] = [];
  private progMesh: THREE.Mesh | null = null;
  private progKey = '';
  private progShown = 0;
  private progTrack: THREE.Mesh | null = null;
  private progTrackMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
  private progMat = arcMaterial(0xffffff, 0.55);
  private perRound: { dispose(): void }[] = [];
  private time = 0;
  private gradient: THREE.DataTexture;
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
    // Schuss als runde Kapsel entlang X (Gesamtlänge 1, Durchmesser 1), damit Länge/Dicke wie vorher skaliert werden
    bullet: new THREE.CapsuleGeometry(0.5, 2, 6, 12).rotateZ(Math.PI / 2).scale(1 / 3, 1, 1),
    flash: new THREE.SphereGeometry(1, 10, 8),
    // rundes Grasblatt (Basis bei y = 0, Spitze oben): fein unterteilt, weich gewölbt
    blade: (() => {
      const g = new THREE.PlaneGeometry(1, 1, 6, 10);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) + 0.5, v = pos.getY(i) + 0.5; // 0..1
        // Blattbreite: unten schmal, Mitte breit, oben rund zulaufend
        const w = 0.34 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 0.92 + 0.04)), 0.75) * (1 - v * 0.25);
        const x = (u - 0.5) * 2 * w;
        // gewölbt: Mitte vorne, Ränder hinten, Spitze nach vorne geneigt
        const z = 0.16 * v * v - (x * x) * 1.6;
        pos.setXYZ(i, x, v, z);
      }
      g.computeVertexNormals();
      return g;
    })(),
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
    this.scene.add(this.camera);

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
      leavesSnow: toon(0xe8f0f8), leavesSnow2: toon(0xcfdeea), leavesPink: toon(0xf6a9c8), leavesPink2: toon(0xffc2da), cliff: toon(0x9a7a5a), cliffDark: toon(0x6f5640),
      seaFloor: new THREE.MeshBasicMaterial({ color: WATER }),
      dust: basicT(0xe8d8b0, 0.55),
      smoke: basicT(0xe8e8e8, 0.5),
      darkSmoke: basicT(0x55575c, 0.55),
      orangeSmoke: basicT(0xff8a3a, 0.6),
      contrail: basicT(0xffffff, 0.55),
      fire: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
      scorch: basicT(0x2a2620, 0.5),
      sparkle: new THREE.MeshBasicMaterial({ color: 0xffe27a }),
      sniperBody: toon(0x4f5a3c),
      scopeLens: new THREE.MeshBasicMaterial({ color: 0x6ad0ff }),
      windowGlass: toon(0x8fc9f0),
      bridgeRail: toon(0x7a5230),
      grassBlade: toon(0xffffff, { side: THREE.DoubleSide }),
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

  private boxMats = new Map<number, THREE.Material>();
  private cone4 = new THREE.CylinderGeometry(0, 1, 1, 4);
  private archGeo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI);
  private firGeo = mergeGeometries([0, 1, 2].map((i) => new THREE.ConeGeometry(2.2 - i * 0.55, 2.4, 8).translate(0, 2.0 + i * 1.45, 0).toNonIndexed()))!;
  private firSnow = mergeGeometries([0, 1, 2].map((i) => new THREE.ConeGeometry((2.2 - i * 0.55) * 0.62, 1.0, 8).translate(0, 2.0 + i * 1.45 + 0.75, 0).toNonIndexed()))!;
  private cactusGeo = mergeGeometries([
    new THREE.CapsuleGeometry(0.45, 3.6, 4, 8).translate(0, 2.25, 0),
    new THREE.CapsuleGeometry(0.3, 1.2, 4, 8).translate(0.95, 2.6, 0),
    new THREE.CylinderGeometry(0.3, 0.3, 0.6, 8).rotateZ(Math.PI / 2).translate(0.55, 2.0, 0),
    new THREE.CapsuleGeometry(0.28, 0.9, 4, 8).translate(-0.85, 3.1, 0),
    new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8).rotateZ(Math.PI / 2).translate(-0.5, 2.7, 0),
  ].map((g) => g.toNonIndexed()))!;
  private palmTrunk = mergeGeometries(Array.from({ length: 6 }, (_, i) => new THREE.CylinderGeometry(0.22 - i * 0.015, 0.26 - i * 0.015, 1.0, 7).translate(i * i * 0.04, 0.5 + i * 0.95, 0).toNonIndexed()))!;
  private palmLeaves = mergeGeometries(Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2; const g = new THREE.SphereGeometry(1, 8, 4); g.scale(1.7, 0.12, 0.45); g.translate(1.5, 0, 0); g.rotateZ(-0.35); g.rotateY(a); g.translate(1.0, 5.8, 0); return g.toNonIndexed(); }).concat([new THREE.SphereGeometry(0.32, 8, 6).translate(1.0, 5.75, 0).toNonIndexed()]))!;
  private firMat = new THREE.MeshToonMaterial({ color: 0x2f7a46 });
  private palmMat = new THREE.MeshToonMaterial({ color: 0x4caf50, side: THREE.DoubleSide });
  private cactusMat = new THREE.MeshToonMaterial({ color: 0x4f9a52 });
  private cactusMat2 = new THREE.MeshToonMaterial({ color: 0x5aa85a });
  private prismR = (() => { const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0.5, 1); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); g.rotateY(Math.PI / 2); return g; })();
  private houseExtras: { x: number; z: number; sx: number; sz: number; mat: THREE.Material }[] = [];
  private propAnims: ((t: number, dt: number) => void)[] = [];
  // Wetter je Biom (Schnee, Blüten) und Fußspuren im Schnee
  private weather: { pts: THREE.Points; mat: THREE.PointsMaterial; vel: Float32Array; kind: string; a: number } | null = null;
  private steps: { mesh: THREE.InstancedMesh; age: Float32Array; next: number; last: Map<number, { x: number; y: number; side: number }> } | null = null;
  private boxMat(c: number) {
    let m = this.boxMats.get(c);
    if (!m) { m = new THREE.MeshToonMaterial({ color: c, gradientMap: this.gradient }); this.boxMats.set(c, m); }
    return m;
  }

  private regionAt(game: Game, x: number, y: number) {
    let best: string | null = null, bd = Infinity;
    for (const g of game.map.regions) { const d = Math.hypot(g.x - x, g.y - y) / g.r; if (d < 0.85 && d < bd) { bd = d; best = g.kind; } }
    return best;
  }

  /** Klippen rund um die Insel und Brandungsstreifen auf dem Wasser */
  private buildCoast(world: THREE.Group) {
    this.buildCliff(world, coastPolygon(360), ISLAND, true);
    // Leuchtturm-Insel: eigene kleine Klippe und Brandung
    for (const i of ISLETS) this.buildCliff(world, Array.from({ length: 64 }, (_, k) => ({ x: i.x + Math.cos(k / 64 * Math.PI * 2) * i.r, y: i.y + Math.sin(k / 64 * Math.PI * 2) * i.r })), i, false);
  }

  private buildCliff(world: THREE.Group, coast: { x: number; y: number }[], ISLAND: { x: number; y: number }, main: boolean) {
    const n = coast.length;
    // Klippenwand: oben an der Küste, unten leicht nach außen versetzt
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const q = coast[i], dx = q.x - ISLAND.x, dy = q.y - ISLAND.y, d = Math.hypot(dx, dy);
      pos.push(q.x * S, -0.01, q.y * S, (q.x + dx / d * 30) * S, -2.6, (q.y + dy / d * 30) * S);
    }
    for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.setIndex(idx);
    cg.computeVertexNormals();
    const cliff = new THREE.Mesh(cg, this.m.cliff);
    (this.m.cliff as THREE.Material).side = THREE.DoubleSide;
    cliff.receiveShadow = true;
    world.add(cliff);
    // Brandung: heller Streifen außen an der Klippe, pulsiert leicht
    const fp: number[] = [], fa: number[] = [], fi: number[] = [];
    for (let i = 0; i < n; i++) {
      const q = coast[i], dx = q.x - ISLAND.x, dy = q.y - ISLAND.y, d = Math.hypot(dx, dy);
      fp.push((q.x + dx / d * 25) * S, -0.36, (q.y + dy / d * 25) * S, (q.x + dx / d * 190) * S, -0.36, (q.y + dy / d * 190) * S);
      fa.push(1, 0);
    }
    for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; fi.push(a, a + 1, b, b, a + 1, b + 1); }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('aEdge', new THREE.Float32BufferAttribute(fa, 1));
    fg.setIndex(fi);
    if (!main && this.foamMat) { this.perRound.push(cg, fg); world.add(new THREE.Mesh(fg, this.foamMat)); return; }
    this.foamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uT: { value: 0 } },
      vertexShader: `attribute float aEdge; varying float vE; varying vec2 vXZ; void main(){ vE = aEdge; vec4 wp = modelMatrix * vec4(position,1.0); vXZ = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uT; varying float vE; varying vec2 vXZ;
        void main(){
          float wave = sin((1.0 - vE) * 14.0 - uT * 2.2 + sin(vXZ.x * 0.15 + vXZ.y * 0.12) * 1.5);
          float foam = smoothstep(0.8, 1.0, wave) * vE;
          float edge = smoothstep(0.75, 1.0, vE);
          vec3 shallow = vec3(0.5, 0.88, 0.92);
          gl_FragColor = vec4(mix(shallow, vec3(1.0), clamp(foam + edge * 0.8, 0.0, 1.0)), vE * 0.75);
        }`,
    });
    this.perRound.push(this.foamMat, cg, fg);
    world.add(new THREE.Mesh(fg, this.foamMat));
  }
  private foamMat: THREE.ShaderMaterial | null = null;

  private groundTexture(game: Game) {
    // höhere Auflösung auf größeren Bildschirmen (PC), Handy bleibt sparsam
    const N = Math.min(window.innerWidth, window.innerHeight) >= 600 ? 4096 : 2048, k = N / WORLD;
    const map = game.map;
    return canvasTexture(N, N, (c) => {
      const coast = coastPolygon(360), inner = coastPolygon(360, BEACH_W);
      const poly = (pts: { x: number; y: number }[]) => { c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q.x * k, q.y * k) : c.moveTo(q.x * k, q.y * k))); c.closePath(); };
      c.clearRect(0, 0, N, N);
      c.fillStyle = C.sand;
      poly(coast); c.fill();
      c.fillStyle = C.grass;
      poly(inner); c.fill();
      // Leuchtturm-Insel: Sandrand, Gras in der Mitte
      for (const i of ISLETS) { c.fillStyle = C.sand; c.beginPath(); c.arc(i.x * k, i.y * k, i.r * k, 0, Math.PI * 2); c.fill(); c.fillStyle = C.grass; c.beginPath(); c.arc(i.x * k, i.y * k, (i.r - 80) * k, 0, Math.PI * 2); c.fill(); }
      c.save();
      poly(coast);
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
      // Regionen: eigener Boden (weich auslaufend)
      const RC: Record<string, string> = { snow: '#eef4fb', desert: '#e8c088', grove: '#a6dc78', beach: C.sand, farm: '#9ccd5e', industry: '#b9bcc2', forest: '#5d9f43', city: '#cfd4da' };
      for (const g of map.regions) {
        if (g.kind === 'city') continue;
        // weiche, breite Übergänge zwischen den Biomen
        const R2 = g.r * 1.18;
        const gr = c.createRadialGradient(g.x * k, g.y * k, g.r * 0.45 * k, g.x * k, g.y * k, R2 * k);
        gr.addColorStop(0, RC[g.kind] + 'ff'); gr.addColorStop(0.55, RC[g.kind] + 'f0'); gr.addColorStop(0.8, RC[g.kind] + '80'); gr.addColorStop(1, RC[g.kind] + '00');
        c.fillStyle = gr; c.beginPath(); c.arc(g.x * k, g.y * k, R2 * k, 0, Math.PI * 2); c.fill();
      }
      // Stadt: helle Fläche innerhalb der Ringstraße (Straßen und Plätze kommen als scharfe Geometrie)
      const rg = map.ring;
      const cg = c.createRadialGradient(rg.x * k, rg.y * k, rg.r * 0.7 * k, rg.x * k, rg.y * k, rg.r * 1.12 * k);
      cg.addColorStop(0, '#d3d8dd'); cg.addColorStop(0.75, '#d3d8dd'); cg.addColorStop(1, '#d3d8dd00');
      c.fillStyle = cg; c.beginPath(); c.arc(rg.x * k, rg.y * k, rg.r * 1.12 * k, 0, Math.PI * 2); c.fill();
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
      c.restore();
    });
  }

  // ---------- Modelle ----------

  /** Waffenmodell (siehe guns.ts), zeigt nach +X, Ursprung am Griff */
  private makeGun(id: WeaponId, tier: number, wrap: WrapId = 'none') {
    if (id === 'fists') return new THREE.Group();
    return buildGun(id, tier, this.gradient, wrap);
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
      ring.position.y = 0.13;
      ring.scale.setScalar(1.1);
      root.add(ring);
    }
    const shadow = new THREE.Mesh(this.g.circle, this.m.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    shadow.scale.setScalar(0.7);
    const lean = new THREE.Group();
    const rig = buildCharacter({ kind: f.look.char, shirt: f.color, seed: f.id * 7 + 3, gradient: this.gradient, toon: this.charToon, outfit: f.look.outfit });
    rig.gunKick.add(this.makeGun(f.weapon.id, f.weapon.tier, f.look.wrap));
    lean.add(rig.body);
    const { chute, disposables } = buildChute(f.look.chute, f.look.design ?? WHITE_CHUTE, this.gradient, this.m.line);
    this.perRound.push(...disposables, ...rig.mats);
    chute.visible = false;
    // Schirm hängt am Körper: dreht und neigt sich mit der Figur
    rig.body.add(chute);
    root.add(shadow, lean);
    this.world!.add(root);
    const v: FighterView = {
      root, shadow, legFwd: 0, legSide: 0, lean, rig, chute, flash: 0, weaponId: f.weapon.id + f.weapon.tier, chuteT: 0, walkT: Math.random() * 6, amp: 0, deadT: 0,
      aimBlend: 0, recoil: 0, dustT: 0, spin: null, yaw: f.aim, reloadBlend: 0, punchT: 0, punchArm: 0, kneel: 0,
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
    ring.position.y = 0.13;
    ring.scale.setScalar(1.15);
    root.add(ring);
    // Lichtstrahl nur bei sehr seltenen Waffen (lila/gold)
    // keine Lichtsäulen mehr über Gegenständen, nur der Ring am Boden
    if (false as boolean) {
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
      const w = parseWeapon(l.kind);
      const g = this.makeGun(w.id, w.tier);
      g.scale.setScalar(1.15);
      g.position.x = -0.45;
      item.add(g);
    } else if (l.kind === 'ammo' || l.kind === 'ammo6') {
      // 3er-Packung; die 6er-Packung sind zwei 3er nebeneinander
      const rows = l.kind === 'ammo6' ? [-0.15, 0.15] : [0];
      for (const z of rows) {
        for (let i = -1; i <= 1; i++) {
          const c = new THREE.Mesh(this.g.cyl, this.m.ammo);
          c.scale.set(0.1, 0.4, 0.1);
          c.position.set(i * 0.24, 0, z);
          const tip = new THREE.Mesh(this.g.cyl, this.m.ammoTip);
          tip.scale.set(0.07, 0.12, 0.07);
          tip.position.set(i * 0.24, 0.25, z);
          item.add(c, tip);
        }
      }
    } else if (l.kind === 'armor' || l.kind === 'armor25' || l.kind === 'medkit' || l.kind === 'bigmed') {
      // neue Modelle: Schild mit Leuchtkern, weiße Erste-Hilfe-Tasche, roter Notfallkoffer
      const it = buildItem(l.kind, this.gradient);
      item.add(it);
    }
    root.add(item);
    if (pop) root.scale.setScalar(0.01);
    this.world!.add(root);
    this.lootViews.set(l.id, { root, item, pop: pop ? 0 : 1, x: l.x, y: l.y, from: pop ? l.from : undefined, face: l.kind === 'armor' || l.kind === 'armor25' });
  }

  private lootTier(k: LootKind) {
    if (k.startsWith('w:')) return parseWeapon(k).tier;
    return k === 'armor' ? 3 : k === 'armor25' ? 2 : k === 'bigmed' ? 3 : k === 'medkit' ? 2 : 1;
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
      // goldene Truhe: gleiches Modell, verschiedene Goldtöne (dunkle Kanten, helle Verschlüsse)
      const gm = (c: number) => this.boxMat(c);
      const M = o.gold
        ? { body: gm(0xe0a52a), edge: gm(0xa8701a), glow: new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), latch: gm(0xffe27a), top: gm(0xffcf4a) }
        : { body: this.m.caseBody, edge: this.m.caseEdge, glow: this.m.caseGlow, latch: this.m.caseLatch, top: this.m.caseEdge };
      if (o.gold) this.perRound.push(M.glow);
      // moderne schwarze Loot-Kiste (Waffenkiste) mit Leuchtstreifen
      const w = o.w * S, d = o.h * S, h = 0.8;
      add(this.g.box, M.body, 0, h / 2, 0, w, h, d);
      // Kantenschutz unten und an den Ecken
      add(this.g.box, M.edge, 0, 0.06, 0, w + 0.08, 0.12, d + 0.08);
      for (const cx of [-w / 2, w / 2]) for (const cz of [-d / 2, d / 2]) add(this.g.box, M.edge, cx, h / 2, cz, 0.16, h + 0.04, 0.16);
      // Leuchtstreifen rundherum
      add(this.g.box, M.glow, 0, h * 0.55, d / 2 + 0.01, w * 0.86, 0.07, 0.02);
      add(this.g.box, M.glow, 0, h * 0.55, -d / 2 - 0.01, w * 0.86, 0.07, 0.02);
      for (const cx of [-w / 2 - 0.01, w / 2 + 0.01]) add(this.g.box, M.glow, cx, h * 0.55, 0, 0.02, 0.07, d * 0.8);
      // Griffe an den Seiten
      for (const cx of [-w / 2 - 0.08, w / 2 + 0.08]) add(this.g.box, M.edge, cx, h * 0.75, 0, 0.08, 0.1, d * 0.4);
      // Deckel: flach, Drehpunkt an der Hinterkante
      lid.position.set(0, h, -d / 2);
      add(this.g.box, M.body, 0, 0.12, d / 2, w + 0.04, 0.24, d + 0.04, lid);
      add(this.g.box, M.top, 0, 0.25, d / 2, w * 0.7, 0.04, d * 0.55, lid);
      add(this.g.box, M.glow, 0, 0.27, d / 2, w * 0.25, 0.02, 0.06, lid);
      // zwei Verschlüsse vorne
      for (const cx of [-w * 0.28, w * 0.28]) add(this.g.box, M.latch, cx, 0.02, d + 0.04, 0.22, 0.26, 0.08, lid);
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
    for (const m of [this.firMat, this.palmMat, this.cactusMat, this.cactusMat2]) m.gradientMap = this.gradient;
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
    this.streaks.forEach((st) => st.mat.dispose());
    this.streaks = [];
    this.timed = [];
    this.canopies = [];
    this.bushes = [];
    this.houses = [];
    this.houseExtras = [];
    this.ponds = [];
    this.progMesh = null;
    this.progTrack = null;
    this.reloadMesh = null;
    this.reloadStep = -1;
    this.reviveMesh = null;
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
    // Meer: türkis an der Küste, tiefblau draußen, wandernde Lichtmuster, Wellen laufen zum Strand
    const isl = ISLETS[0];
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uC: { value: new THREE.Color(this.tod.water) }, uIsl: { value: new THREE.Vector4(ISLAND.x * S, ISLAND.y * S, ISLAND.r * S, 0) }, uLet: { value: new THREE.Vector3(isl.x * S, isl.y * S, isl.r * S) } },
      vertexShader: `varying vec2 vXZ; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vXZ = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uT; uniform vec3 uC; uniform vec4 uIsl; uniform vec3 uLet; varying vec2 vXZ;
        void main(){
          vec2 q = vXZ - uIsl.xy;
          float a = atan(q.y, q.x);
          float R = uIsl.z * (1.0 + sin(a * 3.0 + 13.3) * 0.08 + sin(a * 5.0 + 11.9) * 0.048 + sin(a * 11.0 + 1.3) * 0.02);
          float d = length(q) - R;
          d = min(d, length(vXZ - uLet.xy) - uLet.z);
          float x = vXZ.x, z = vXZ.y, t = uT;
          float n = sin(x * 0.55 + t * 0.9) * sin(z * 0.5 - t * 0.7) + sin((x + z) * 0.31 + t * 1.2) * 0.55 + sin((x - z) * 0.83 - t * 0.6) * 0.35;
          float n2 = sin(x * 1.3 - t * 1.4 + sin(z * 0.7) * 2.0) * sin(z * 1.2 + t * 1.1);
          vec3 deep = uC * 0.8, shallow = vec3(0.36, 0.83, 0.86);
          vec3 col;
          if (d < 0.0) {
            // Teiche und Brunnen: ruhiges Wasser
            col = mix(uC * 0.95, shallow, 0.25) + vec3(smoothstep(1.05, 1.5, n) * 0.18);
          } else {
            col = mix(shallow, deep, smoothstep(0.0, 34.0, d));
            col *= 0.95 + n * 0.035;
            // Lichtnetz im flachen Wasser, Glitzern draußen
            col += vec3(0.85, 0.95, 1.0) * smoothstep(1.0, 1.45, n) * (0.22 * (1.0 - smoothstep(4.0, 30.0, d)) + 0.08);
            col += vec3(smoothstep(0.86, 1.0, n2) * 0.12);
            float wave = sin(d * 1.15 - t * 2.1 + sin(x * 0.15 + z * 0.12) * 1.5);
            float foam = smoothstep(0.88, 1.0, wave) * (1.0 - smoothstep(1.0, 8.0, d));
            float edge = 1.0 - smoothstep(0.0, 0.9 + sin(t * 1.7 + x * 0.4 + z * 0.3) * 0.35, d);
            col = mix(col, vec3(1.0), clamp(foam * 0.75 + edge * 0.9, 0.0, 1.0));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.perRound.push(this.waterMat);
    flat(add(this.g.plane, this.waterMat, W / 2, -0.4, W / 2, 2000, 2000, 1)).receiveShadow = false;
    this.buildCoast(world);
    const tex = this.groundTexture(game);
    const groundMat = new THREE.MeshToonMaterial({ map: tex, gradientMap: this.gradient, alphaTest: 0.5 });
    this.perRound.push(tex, groundMat);
    flat(add(this.g.plane, groundMat, W / 2, 0, W / 2, W, W, 1));
    // scharfe Straßen, Wege, Plätze und Felder
    {
      const gm = new Map<string, THREE.Material>();
      const gmat = (c: number, lift: number) => {
        const k = c + ':' + lift;
        let m = gm.get(k);
        if (!m) { m = new THREE.MeshToonMaterial({ color: c, gradientMap: this.gradient, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 - lift, polygonOffsetUnits: -2 - lift * 2 }); gm.set(k, m); this.perRound.push(m); }
        return m;
      };
      const gb = buildGround(game.map, gmat);
      for (const m of gb.meshes) world.add(m);
      this.perRound.push(...gb.dispose);
    }
    // Requisiten (Deko je Biom)
    this.propAnims = [];
    buildProps(game.map, { world, toon: (c) => this.boxMat(c), water: this.waterMat, anims: this.propAnims, dispose: this.perRound as (THREE.BufferGeometry | THREE.Material)[] });
    {
      const N = 700, pos = new Float32Array(N * 3), vel = new Float32Array(N);
      for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 80; pos[i * 3 + 1] = Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 80; vel[i] = 0.6 + Math.random() * 0.8; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.32, transparent: true, opacity: 0, depthWrite: false });
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.visible = false;
      world.add(pts);
      this.perRound.push(g, mat);
      this.weather = { pts, mat, vel, kind: '', a: 0 };
      const sg = new THREE.CircleGeometry(0.16, 8).rotateX(-Math.PI / 2); sg.scale(1, 1, 1.6);
      const sm = new THREE.MeshBasicMaterial({ color: 0xbccbdb, transparent: true, opacity: 0.8, depthWrite: false });
      const mesh = new THREE.InstancedMesh(sg, sm, 260); mesh.frustumCulled = false; mesh.renderOrder = 1;
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < 260; i++) mesh.setMatrixAt(i, zero);
      world.add(mesh);
      this.perRound.push(sg, sm, mesh);
      this.steps = { mesh, age: new Float32Array(260).fill(99), next: 0, last: new Map() };
    }

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
    const logTex = canvasTexture(64, 64, (c) => {
      c.fillStyle = '#9a6a3c'; c.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 64; y += 16) { c.fillStyle = '#b07c48'; c.fillRect(0, y + 2, 64, 11); c.fillStyle = '#7a4e28'; c.fillRect(0, y + 13, 64, 3); }
    });
    logTex.wrapS = logTex.wrapT = THREE.RepeatWrapping; logTex.repeat.set(1, 1);
    this.perRound.push(logTex);
    const STY: Record<string, { walls: number[]; roofs: number[]; trim?: number }> = {
      normal: { walls: C.walls, roofs: C.roofs }, shop: { walls: C.walls, roofs: C.roofs },
      hall: { walls: [0xefe6d6], roofs: [0x4a5a78], trim: 0xb8a68a },
      snow: { walls: [0xe9eef3, 0xf3e6d6, 0xdfe8ef], roofs: [0xb8433a, 0x3d6fae, 0x5b6b7a] },
      west: { walls: [0xc89a62, 0xd8b07a, 0xb98a55], roofs: [0x8a5a36, 0x9c6a42] , trim: 0x6e4424 },
      jp: { walls: [0xf6eedc, 0xf3e8d2], roofs: [0x3a3f4a, 0x4a3a3a], trim: 0x4a2e1e },
      log: { walls: [0xffffff], roofs: [0x3f6b45, 0x5b4636, 0x8a3e2e], trim: 0x5e3d20 },
      barn: { walls: [0xb8322a, 0xa62d26], roofs: [0x4a4f58], trim: 0xf4f0e6 },
      factory: { walls: [0xb9bcc2, 0xa8adb5], roofs: [0x6b7a8a, 0x5b6b7a], trim: 0x4a505c },
      beach: { walls: [0xfde7c8, 0xd8f0f0, 0xfff2e0], roofs: [0x3dc6c6, 0xff8a6e, 0xf2c94c] },
    };
    game.houses.forEach((h, i) => {
      const s = h.s * S, st = h.style ?? 'normal', pal = STY[st] ?? STY.normal;
      flat(add(this.g.plane, floorMat, h.x * S, 0.03, h.y * S, s, s, 1));
      const wallMat = new THREE.MeshToonMaterial({ color: pal.walls[i % pal.walls.length], gradientMap: this.gradient, map: st === 'log' ? logTex : null });
      const roofMat = new THREE.MeshToonMaterial({ color: pal.roofs[i % pal.roofs.length], gradientMap: this.gradient });
      const trimMat = new THREE.MeshToonMaterial({ color: pal.trim ?? C.trim, gradientMap: this.gradient });
      const chimMat = new THREE.MeshToonMaterial({ color: 0x9c6a52, gradientMap: this.gradient });
      const snowMat = new THREE.MeshToonMaterial({ color: 0xf6fafd, gradientMap: this.gradient });
      const glassMat = new THREE.MeshToonMaterial({ color: 0xa8d8f0, gradientMap: this.gradient });
      const upperWall = wallMat.clone();
      this.perRound.push(wallMat, roofMat, trimMat, chimMat, snowMat, glassMat, upperWall);
      const roof = new THREE.Group();
      const mats: THREE.Material[] = [trimMat, roofMat, chimMat];
      add(this.g.box, trimMat, 0, WALL_H + 0.12, 0, s + 0.6, 0.24, s + 0.6, roof);
      if (st === 'jp') {
        // geschwungenes Walmdach mit hochgezogenen Ecken, kleiner Aufsatz oben
        // unterer Dachkranz weit ausladend, darüber ein steiles Walmdach
        add(this.cone4, roofMat, 0, WALL_H + 0.24 + 0.7, 0, (s + 2.4) * 0.72, 1.4, (s + 2.4) * 0.72, roof).rotation.y = Math.PI / 4;
        add(this.g.box, upperWall, 0, WALL_H + 1.2, 0, s * 0.62, 1.0, s * 0.62, roof);
        add(this.cone4, roofMat, 0, WALL_H + 1.7 + 1.5, 0, (s * 0.62 + 1.4) * 0.72, 3.0, (s * 0.62 + 1.4) * 0.72, roof).rotation.y = Math.PI / 4;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(this.cone4, roofMat, sx * (s / 2 + 0.9), WALL_H + 0.55, sz * (s / 2 + 0.9), 0.3, 0.8, 0.3, roof);
        add(this.g.box, trimMat, 0, WALL_H + 4.6, 0, 0.6, 0.3, 0.6, roof);
        mats.push(upperWall);
      } else if (st === 'west') {
        // flaches Dach, hohe Holzfassade über der Tür (Westernstil)
        add(this.g.box, roofMat, 0, WALL_H + 0.4, 0, s + 0.4, 0.3, s + 0.4, roof);
        const d = h.doors[0];
        if (d) {
          const fx = d.nx * (s / 2 + 0.05), fz = d.ny * (s / 2 + 0.05), along = Math.abs(d.nx) < 0.5;
          add(this.g.box, wallMat, fx, WALL_H + 1.1, fz, along ? s + 0.2 : 0.25, 1.6, along ? 0.25 : s + 0.2, roof);
          add(this.g.box, trimMat, fx + d.nx * 0.14, WALL_H + 1.9, fz + d.ny * 0.14, along ? s + 0.4 : 0.12, 0.18, along ? 0.12 : s + 0.4, roof);
          add(this.g.box, trimMat, fx + d.nx * 0.16, WALL_H + 1.05, fz + d.ny * 0.16, along ? s * 0.5 : 0.08, 0.6, along ? 0.08 : s * 0.5, roof);
        }
      } else if (st === 'factory') {
        // Sheddach: mehrere Sägezähne mit Glasflächen
        const n = 3, w = (s + 0.6) / n;
        for (let k = 0; k < n; k++) {
          const z = -s / 2 - 0.3 + w * (k + 0.5);
          add(this.prismR, roofMat, 0, WALL_H + 0.24, z, s + 0.6, 2.2, w, roof);
          add(this.g.box, glassMat, 0, WALL_H + 1.3, z + w / 2 - 0.02, s + 0.4, 2.0, 0.06, roof);
        }
        mats.push(glassMat);
      } else {
        const tall = st === 'barn' ? 4.6 : st === 'hall' ? 3.2 : 3.6;
        add(this.g.gable, roofMat, 0, WALL_H + 0.24, 0, s + 0.8, tall, s + 0.8, roof).rotation.y = Math.PI / 2;
        if (st === 'snow') {
          // Schnee auf dem Dach: weiße Schicht, unten schaut die Dachfarbe raus
          add(this.g.gable, snowMat, 0, WALL_H + 0.62, 0, (s + 0.8) * 0.84, tall * 0.94, s + 1.0, roof).rotation.y = Math.PI / 2;
          mats.push(snowMat);
        }
        if (st !== 'hall' && st !== 'barn') add(this.g.box, chimMat, s * 0.22, WALL_H + 2.6, s * 0.18, 0.7, 1.8, 0.7, roof);
        if (st === 'snow') add(this.g.box, snowMat, s * 0.22, WALL_H + 3.55, s * 0.18, 0.8, 0.14, 0.8, roof);
        if (st === 'barn') for (const sx of [-1, 1]) add(this.g.box, trimMat, 0, WALL_H + 2.3, sx * (s / 2 + 0.42), s * 0.5, 0.18, 0.06, roof);
      }
      if (st === 'hall') {
        // Uhrturm auf dem Rathaus
        const tw = 4.2, base = WALL_H + 0.2, top = base + 9;
        const clockW = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: this.gradient }), clockB = new THREE.MeshToonMaterial({ color: 0x22232b, gradientMap: this.gradient });
        this.perRound.push(clockW, clockB);
        add(this.g.box, upperWall, 0, (base + top) / 2, 0, tw, top - base, tw, roof);
        add(this.g.box, trimMat, 0, top, 0, tw + 0.5, 0.35, tw + 0.5, roof);
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = add(this.g.circle, clockW, nx * (tw / 2 + 0.03), top - 1.8, nz * (tw / 2 + 0.03), 1.3, 1.3, 1, roof);
          c.rotation.y = Math.atan2(nx, nz);
          const hand = add(this.g.box, clockB, nx * (tw / 2 + 0.08), top - 1.5, nz * (tw / 2 + 0.08), nz ? 0.12 : 0.04, 0.8, nx ? 0.12 : 0.04, roof);
          hand.position.y = top - 1.45;
          const hand2 = add(this.g.box, clockB, nx * (tw / 2 + 0.09), top - 1.8, nz * (tw / 2 + 0.09), nz ? 0.6 : 0.04, 0.12, nx ? 0.6 : 0.04, roof);
          hand2.position.x += nz ? 0.25 : 0; hand2.position.z += nx ? 0.25 : 0;
        }
        add(this.cone4, roofMat, 0, top + 0.17 + 1.6, 0, tw * 0.8, 3.2, tw * 0.8, roof).rotation.y = Math.PI / 4;
        add(this.g.blob, clockW, 0, top + 3.6, 0, 0.3, 0.3, 0.3, roof);
        mats.push(upperWall, clockW, clockB);
      }
      roof.position.set(h.x * S, 0, h.y * S);
      world.add(roof);
      this.houses.push({ roof, roofMats: mats, wallMat, fade: 1 });
      // Vordach über jeder Tür (dezent)
      for (const d of h.doors) {
        const along = Math.abs(d.nx) < 0.5;
        this.houseExtras.push({ x: d.x * S + d.nx * 0.45, z: d.y * S + d.ny * 0.45, sx: along ? 2.2 : 0.9, sz: along ? 0.9 : 2.2, mat: trimMat });
      }
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
        // an der Tür genau so breit wie die Türöffnung, nach außen leicht breiter
        c.moveTo(18, 0); c.lineTo(110, 0); c.lineTo(126, 128); c.lineTo(2, 128);
        c.closePath();
        c.fill();
        // weiche Seitenränder
        c.globalCompositeOperation = 'destination-out';
        const side = c.createLinearGradient(0, 0, 128, 0);
        side.addColorStop(0, 'rgba(0,0,0,0.9)'); side.addColorStop(0.12, 'rgba(0,0,0,0)');
        side.addColorStop(0.88, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,0.9)');
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
        // Breite passend zur Tür (86 Einheiten), Länge 2/3 von vorher
        const len = 2.8, wid = 6.0;
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
    for (const e of this.houseExtras) sadd(this.g.box, e.mat, e.x, WALL_H - 0.12, e.z, e.sx, 0.12, e.sz);
    // Baumart je Biom; am Rand der Biome weich gemischt
    let ts = 7;
    const trnd = () => ((ts = (ts * 1664525 + 1013904223) >>> 0) / 4294967296);
    const treeRegion = (x: number, y: number) => {
      let best: string | null = null, bd = Infinity;
      for (const g of game.map.regions) { const d = Math.hypot(g.x - x, g.y - y) / g.r; if (d < 0.72 + trnd() * 0.5 && d < bd) { bd = d; best = g.kind; } }
      return best;
    };
    for (const o of game.obstacles) {
      const x = o.x * S, z = o.y * S;
      if (o.hide) continue;
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
              // dezente Details: Fensterläden bei manchen Häusern, Blumenkasten bei wenigen
              const deco = (hi * 7) % 10;
              if (deco < 3) for (const sd of [-1, 1]) sadd(this.g.box, this.houses[hi].roofMats[1], wx + (horizW ? sd * 0.95 : outer * 0.03), 1.22, wz + (horizW ? outer * 0.03 : sd * 0.95), horizW ? 0.45 : 0.06, 0.95, horizW ? 0.06 : 0.45);
              if (deco === 4 || deco === 8) {
                sadd(this.g.box, this.m.wood, wx + (horizW ? 0 : outer * 0.15), 0.68, wz + (horizW ? outer * 0.15 : 0), horizW ? 1.3 : 0.3, 0.22, horizW ? 0.3 : 1.3);
                for (let k = -1; k <= 1; k++) sadd(this.g.blob, k ? this.m.red : this.m.gold, wx + (horizW ? k * 0.4 : outer * 0.15), 0.86, wz + (horizW ? outer * 0.15 : k * 0.4), 0.15, 0.12, 0.15);
              }
              sadd(this.g.box, this.m.white, wx, 1.22, wz, horizW ? 1.35 : 0.08, 0.95, horizW ? 0.08 : 1.35);
              sadd(this.g.box, this.m.windowGlass, wx + (horizW ? 0 : outer * 0.02), 1.22, wz + (horizW ? outer * 0.02 : 0), horizW ? 1.1 : 0.06, 0.72, horizW ? 0.06 : 1.1);
              sadd(this.g.box, this.m.white, wx + (horizW ? 0 : outer * 0.04), 1.22, wz + (horizW ? outer * 0.04 : 0), horizW ? 0.07 : 0.05, 0.72, horizW ? 0.05 : 0.07);
            }
          }
          break;
        }
        case 'rock': {
          const r = o.r * S;
          const rot = new THREE.Euler(Math.random() * 0.3, Math.random() * 6, Math.random() * 0.3);
          const reg = this.regionAt(game, o.x, o.y);
          sadd(this.g.rock, reg === 'desert' ? this.boxMat(0xc9875a) : this.m.rock, x, r * 0.42, z, r, r * 0.78, r, rot);
          if (reg === 'snow') sadd(this.g.rock, this.m.leavesSnow, x, r * 0.62, z, r * 0.86, r * 0.55, r * 0.86, rot);
          break;
        }
        case 'tree': {
          const reg = treeRegion(o.x, o.y);
          const v = trnd();
          if (reg === 'desert') {
            // Kaktus (Saguaro)
            const k = 0.8 + v * 0.5, cm = v < 0.5 ? this.cactusMat : this.cactusMat2;
            const m = add(this.cactusGeo, cm, x, 0, z, k, k, k);
            m.rotation.y = v * 6;
            this.canopies.push({ meshes: [m], x: o.x, y: o.y, r: 30, faded: false, normal: cm, fade: this.m.leavesFade, wobble: 0, base: [] });
            break;
          }
          if (reg === 'beach') {
            // Palme: gebogener Stamm, Wedel oben
            const k = 0.9 + v * 0.4, ry = v * 6;
            sadd(this.palmTrunk, this.m.trunk, x, 0, z, k, k, k, new THREE.Euler(0, ry, 0));
            const m = add(this.palmLeaves, this.palmMat, x, 0, z, k, k, k);
            m.rotation.y = ry;
            this.canopies.push({ meshes: [m], x: o.x, y: o.y, r: 50, faded: false, normal: this.palmMat, fade: this.m.leavesFade, wobble: 0, base: [] });
            break;
          }
          if (reg === 'snow' || (reg === 'forest' && v < 0.55)) {
            // Tanne (im Schnee mit weißen Spitzen)
            const k = 0.85 + trnd() * 0.45;
            sadd(this.g.trunk, this.m.trunk, x, 0.6, z, 0.8, 1.2, 0.8);
            const m = add(this.firGeo, this.firMat, x, 0, z, k, k, k);
            const meshes = [m];
            if (reg === 'snow') meshes.push(add(this.firSnow, this.m.leavesSnow, x, 0, z, k, k, k));
            this.canopies.push({ meshes, x: o.x, y: o.y, r: 45, faded: false, normal: this.firMat, fade: this.m.leavesFade, wobble: 0, base: [] });
            break;
          }
          sadd(this.g.trunk, this.m.trunk, x, 1.1, z, 1, 2.2, 1);
          const mats = reg === 'grove' ? [this.m.leavesPink, this.m.leavesPink2, this.m.leavesPink] : [this.m.leaves0, this.m.leaves1, this.m.leaves2];
          const mat = mats[Math.floor(v * mats.length)];
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
          if (o.r !== game.map.river.width / 2 && o.r !== RAIL_R && o.r !== FOUNTAIN_R) waterParts.push({ x, z, r: o.r * S });
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
        case 'box': {
          // Container, Zelte, Türme: farbiger Block mit dunklem Sockel und heller Oberkante
          const hgt = (o.tall ?? 60) * S, col = o.c ?? 0x8a929e;
          sadd(this.g.box, this.boxMat(col), x, hgt / 2, z, o.w * S, hgt, o.h * S);
          sadd(this.g.box, this.boxMat(0x2b2f38), x, 0.08, z, o.w * S + 0.06, 0.16, o.h * S + 0.06);
          sadd(this.g.box, this.boxMat(0xffffff), x, hgt + 0.04, z, o.w * S * 0.9, 0.08, o.h * S * 0.9);
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

    // Fluss als durchgehendes Band mit eigenem, fließendem Wasser
    {
      const rv = game.map.river;
      const curve = new THREE.CatmullRomCurve3(rv.pts.map((p) => new THREE.Vector3(p.x * S, 0, p.y * S)));
      const n = 320, half = (rv.width / 2 + 8) * S;
      const pos: number[] = [], uv: number[] = [], idx: number[] = [], edge: number[] = [];
      let along = 0;
      let prev = curve.getPointAt(0);
      let count = 0;
      for (let i = 0; i <= n; i++) {
        const t = i / n, p = curve.getPointAt(t), tg = curve.getTangentAt(t);
        along += p.distanceTo(prev);
        prev = p;
        // Abstand zur Inselkante (negativ = über dem Meer); weit draußen nicht mehr zeichnen
        const cdx = p.x / S - ISLAND.x, cdy = p.z / S - ISLAND.y;
        const ed = (landRadius(Math.atan2(cdy, cdx)) - Math.hypot(cdx, cdy)) * S;
        if (ed < -9) continue;
        const nx = -tg.z, nz = tg.x;
        // hinter der Küste fällt das Wasser sanft auf Meereshöhe ab
        const y = ed >= 0 ? 0.05 : 0.05 - Math.min(1, -ed / 3) * 0.43;
        pos.push(p.x + nx * half, y, p.z + nz * half, p.x - nx * half, y, p.z - nz * half);
        edge.push(ed, ed);
        uv.push(along, 0, along, 1);
        if (count > 0) { const a = (count - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        count++;
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      rg.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
      rg.setIndex(idx);
      this.riverMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: { uT: this.windTime },
        vertexShader: `attribute float aEdge; varying vec2 vUv; varying float vEdge; void main(){ vUv = uv; vEdge = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float uT; varying vec2 vUv;
          varying float vEdge;
          void main(){
            float u = vUv.x, v = vUv.y;
            float edge = abs(v - 0.5) * 2.0;
            vec3 deep = vec3(0.13, 0.47, 0.74), shallow = vec3(0.38, 0.8, 0.86);
            vec3 col = mix(deep, shallow, smoothstep(0.3, 1.0, edge));
            // Strömungsstreifen, die flussabwärts wandern
            float s1 = sin(u * 0.8 - uT * 2.2 + sin(v * 9.0 + u * 0.25) * 1.2);
            float s2 = sin(u * 1.7 - uT * 3.1 + v * 14.0);
            col += vec3(smoothstep(0.88, 1.0, s1) * 0.15 + smoothstep(0.93, 1.0, s2) * 0.08) * (1.0 - edge * 0.6);
            // Schaum am Ufer
            float foam = smoothstep(0.8, 0.96, edge) * (0.65 + 0.35 * sin(u * 2.3 - uT * 2.6));
            // Mündung: zur Küste hin heller und flacher, Ufer-Schaum verschwindet, dann weich ausblenden
            float mouth = 1.0 - smoothstep(-2.0, 10.0, vEdge);
            foam *= 1.0 - mouth;
            col = mix(col, vec3(0.95, 0.98, 1.0), foam);
            col = mix(col, vec3(0.45, 0.85, 0.9), mouth * 0.85);
            // über dem Meer weich ins Flachwasser ausblenden
            float a = 1.0 - smoothstep(1.0, 8.0, -vEdge);
            gl_FragColor = vec4(col, a);
          }`,
      });
      this.perRound.push(rg, this.riverMat);
      const rm = new THREE.Mesh(rg, this.riverMat);
      rm.renderOrder = 1;
      world.add(rm);
    }
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
      const L = (game.map.river.width + 150) * S, Wd = 6.2, st = b.style ?? 'wood';
      if (st === 'stone') {
        // Steinbrücke mit Brüstung und Bogen
        const sm = this.boxMat(0xb8b2a6), sd = this.boxMat(0x948e82);
        add(this.g.box, sm, 0, -0.04, 0, L, 0.3, Wd, grp);
        for (const side of [Wd / 2 - 0.25, -Wd / 2 + 0.25]) { add(this.g.box, sd, 0, 0.45, side, L, 0.7, 0.5, grp); add(this.g.box, sm, 0, 0.84, side, L + 0.2, 0.12, 0.62, grp); }
        for (const ex of [-L / 2, L / 2]) for (const side of [Wd / 2 - 0.25, -Wd / 2 + 0.25]) add(this.g.box, sd, ex, 0.65, side, 0.8, 1.3, 0.8, grp);
      } else if (st === 'rope') {
        // Hängebrücke: Planken, hohe Pfosten, durchhängende Seile
        add(this.g.box, deckMat, 0, -0.02, 0, L, 0.16, Wd * 0.7, grp);
        const posts: THREE.Vector3[] = [];
        for (const ex of [-L / 2 - 0.2, L / 2 + 0.2]) for (const side of [Wd * 0.38, -Wd * 0.38]) { add(this.g.box, this.m.bridgeRail, ex, 1.3, side, 0.3, 2.6, 0.3, grp); posts.push(new THREE.Vector3(ex, 2.5, side)); }
        const lp: number[] = [];
        for (const side of [Wd * 0.38, -Wd * 0.38]) {
          const n = 16;
          for (let k = 0; k < n; k++) {
            const t0 = k / n, t1 = (k + 1) / n, x0 = -L / 2 + t0 * L, x1 = -L / 2 + t1 * L;
            const y0 = 2.5 - Math.sin(t0 * Math.PI) * 1.5, y1 = 2.5 - Math.sin(t1 * Math.PI) * 1.5;
            lp.push(x0, y0, side, x1, y1, side);
            if (k % 2 === 0 && k > 0) lp.push(x0, y0, side, x0, 0.05, side);
          }
        }
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
        this.perRound.push(lg);
        grp.add(new THREE.LineSegments(lg, this.m.line));
      } else {
        add(this.g.box, deckMat, 0, -0.06, 0, L, 0.24, Wd, grp);
        for (const side of [Wd / 2 - 0.15, -Wd / 2 + 0.15]) {
          for (let i = 0; i <= 6; i++) add(this.g.box, this.m.bridgeRail, -L / 2 + (i / 6) * L, 0.45, side, 0.18, 0.9, 0.18, grp);
          add(this.g.box, this.m.bridgeRail, 0, 0.88, side, L, 0.12, 0.16, grp);
        }
      }
      world.add(grp);
    }
    // gefrorener Teich: Eisfläche mit Rissen
    for (const pd of game.map.ponds) {
      if (!pd.ice) continue;
      const ice = flat(add(this.g.circle, this.boxMat(0xcfeaf7), pd.x * S, 0.03, pd.y * S, pd.r * S, pd.r * S, 1));
      ice.receiveShadow = true;
      const crack = flat(add(this.g.ring, this.boxMat(0xa9d3ea), pd.x * S, 0.035, pd.y * S, pd.r * S * 0.55, pd.r * S * 0.55, 1));
      crack.receiveShadow = true;
    }
    // dichte Wiesen: Büschel aus breiten, überlappenden Blättern (InstancedMesh, wiegen sich im Wind)
    // dunkleres, satteres Grün als der Boden, damit die Wiese klar erkennbar ist
    const greens = [0x3f9440, 0x348537, 0x47a046, 0x2e7a33, 0x3b8e3c];
    for (const gf of game.map.grass) {
      const R = gf.r * S;
      // Büschel in einem lockeren Raster mit Zufallsversatz -> dicht, aber ohne Lücken
      const clumps: { x: number; z: number; e: number }[] = [];
      const step = 0.95;
      for (let x = -R; x <= R; x += step) {
        for (let z = -R; z <= R; z += step) {
          const px = x + (Math.random() - 0.5) * step * 0.9, pz = z + (Math.random() - 0.5) * step * 0.9;
          const d = Math.hypot(px, pz) / R;
          if (d > 1 || (d > 0.85 && Math.random() < (d - 0.85) * 5)) continue;
          clumps.push({ x: px, z: pz, e: d });
        }
      }
      const perClump = 6;
      const n = clumps.length * perClump;
      const inst = new THREE.InstancedMesh(this.g.blade, this.m.grassBlade, n);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
      const col = new THREE.Color();
      let i = 0;
      for (const c of clumps) {
        const base = Math.random() * Math.PI * 2;
        const tint = greens[Math.floor(Math.random() * greens.length)];
        for (let k = 0; k < perClump; k++) {
          const yaw = base + (k / perClump) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
          ps.set(gf.x * S + c.x + Math.cos(yaw) * 0.08, 0, gf.y * S + c.z + Math.sin(yaw) * 0.08);
          // Blätter kippen vom Büschelzentrum nach außen
          q.setFromEuler(new THREE.Euler(0, -yaw + Math.PI / 2, 0)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55 + Math.random() * 0.35, 0, 0)));
          const h = (1.15 + Math.random() * 0.45) * (1 - c.e * 0.3);
          const w = 1.3 + Math.random() * 0.5;
          sc.set(w, h, w);
          m4.compose(ps, q, sc);
          inst.setMatrixAt(i, m4);
          inst.setColorAt(i, col.setHex(tint).offsetHSL(0, 0, (Math.random() - 0.5) * 0.06));
          i++;
        }
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

  /** Freifall: feine Windstreifen in Flugrichtung, die an der Figur vorbeiziehen (im Raum fest, die Figur fliegt hindurch) */
  private streaks: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; pos: THREE.Vector3; len: number }[] = [];
  private ffPrev = new THREE.Vector3();
  private ffVel = new THREE.Vector3(0, -1, 0);
  private updateFreefallFx(game: Game, dt: number) {
    const p = game.player;
    const on = p.alive && p.phase === 'fall' && p.z > CHUTE_Z;
    const cur = new THREE.Vector3(p.x * S, p.z * S, p.y * S);
    if (on && dt > 0) {
      const v = cur.clone().sub(this.ffPrev).divideScalar(dt);
      if (v.lengthSq() > 1 && v.lengthSq() < 1e5) this.ffVel.lerp(v, 0.2);
    }
    this.ffPrev.copy(cur);
    if (on && !this.streaks.length) {
      for (let i = 0; i < 18; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
        const mesh = new THREE.Mesh(this.g.cyl, mat);
        this.world!.add(mesh);
        const st = { mesh, mat, pos: new THREE.Vector3(), len: 1 };
        this.streaks.push(st);
        this.respawnStreak(st, cur, true);
      }
    }
    const dir = this.ffVel.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    for (const st of this.streaks) {
      st.mesh.visible = on;
      if (!on) continue;
      const rel = st.pos.clone().sub(cur);
      const along = rel.dot(dir);
      // hinter der Figur angekommen: vorne neu erzeugen
      if (along < -5 || rel.length() > 22) this.respawnStreak(st, cur, false);
      const d = st.pos.distanceTo(cur);
      st.mat.opacity = 0.42 * Math.min(1, (22 - d) / 8) * Math.min(1, Math.max(0, d - 1.2) / 2);
      st.mesh.position.copy(st.pos);
      st.mesh.quaternion.copy(q);
      st.mesh.scale.set(0.022, st.len, 0.022);
    }
  }

  private respawnStreak(st: { pos: THREE.Vector3; len: number }, cur: THREE.Vector3, any: boolean) {
    const dir = this.ffVel.clone().normalize();
    // Punkt vor der Figur (in Flugrichtung), seitlich versetzt
    const side = new THREE.Vector3(1, 0, 0).cross(dir).normalize();
    const side2 = dir.clone().cross(side).normalize();
    const a = Math.random() * Math.PI * 2, r = 1.4 + Math.random() * 4.5;
    const ahead = any ? -5 + Math.random() * 20 : 10 + Math.random() * 8;
    st.pos.copy(cur).addScaledVector(dir, ahead).addScaledVector(side, Math.cos(a) * r).addScaledVector(side2, Math.sin(a) * r);
    st.len = 1.6 + Math.random() * 2.6;
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
            this.lootViews.delete(e.loot.id);
            this.world!.remove(v.root);
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
        case 'jump':
          if (e.f.isPlayer) this.snapCam = true;
          break;
        case 'land': {
          const lv = this.fighterViews.get(e.f);
          if (lv) lv.squash = 1;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            this.puff(e.f.x * S, 0.3, e.f.y * S, this.m.dust, 0.35, 1.8, 0.7, Math.cos(a) * 3, 0.5, Math.sin(a) * 3);
          }
          break;
        }
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
    this.updateFreefallFx(game, dt);

    this.playerRing.visible = p.alive && p.phase === 'ground' && !this.fpp.on;
    this.playerRing.position.set(p.x * S, 0.13, p.y * S);
    this.playerRing.rotation.z = this.time;

    // Ziellinie des Spielers
    const aiming = !this.fpp.on && p.alive && p.phase === 'ground' && !p.downed && p.weapon.id !== 'fists' && game.input.aim !== null && !game.over;
    this.aimLine.visible = aiming;
    if (aiming) {
      // Ziellinie zeigt zur Maus / zum rechten Stick, auch wenn die Figur in Laufrichtung schaut
      const aimA = game.input.aim ?? p.aim;
      const len = game.rayLength(p.x, p.y, aimA, p.weapon.range) * S;
      this.aimLine.position.set(p.x * S + Math.cos(aimA) * 0.9, 0.16, p.y * S + Math.sin(aimA) * 0.9);
      this.aimLine.rotation.y = -aimA;
      // auf ganze Punkte runden (Abstand 0.8), damit am Ende kein halber Punkt steht
      const l = Math.max(0.8, Math.floor((len - 0.9) / 0.8) * 0.8);
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

    this.plane.visible = false;

    for (const f of this.propAnims) f(this.time, dt);
    this.updateBiomeFx(game, dt);
    this.updateCamera(game, dt);
    this.updateSun();
    this.renderer.render(this.scene, this.camera);
  }

  private updateFighter(f: Fighter, game: Game, dt: number, playerHouse: number) {
    const v = this.fighterViews.get(f);
    if (!v) return;
    const rig = v.rig;
    if (v.weaponId !== f.weapon.id + f.weapon.tier) {
      rig.gunKick.clear();
      rig.gunKick.add(this.makeGun(f.weapon.id, f.weapon.tier, f.look.wrap));
      v.spin = rig.gunKick.getObjectByName('spin') ?? null;
      v.weaponId = f.weapon.id + f.weapon.tier;
    }
    // weit weg von der Kamera: Figur nicht zeichnen und nicht animieren (100 Spieler)
    if (!f.isPlayer && f.phase !== 'plane') {
      const dx = f.x * S - this.camTarget.x, dz = f.y * S - this.camTarget.z, lim = 85 + this.camTarget.y * 2;
      if (dx * dx + dz * dz > lim * lim) { v.root.visible = false; return; }
    }
    if (!f.alive) {
      // umfallen (0,45 s), liegen bleiben, dann im Boden versinken (gesamt ~2,8 s)
      if (v.root.visible) {
        if (!v.deathSnap) {
          v.deathSnap = capturePose(rig);
          const r = (f.id * 7 + Math.floor(this.time * 10)) % 10;
          v.deathKind = v.kneel > 0.5 ? 'down' : r < 4 ? 'back' : r < 7 ? 'front' : r < 9 ? 'left' : 'right';
        }
        v.deadT += dt;
        v.lean.rotation.set(0, 0, 0);
        poseDeath(rig, v.deathSnap, v.deathKind!, v.deadT, f.id);
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
    v.root.visible = f.phase !== 'plane' && !f.hidden && !inOtherHouse && !(f.isPlayer && this.fpp.on);
    // im eigenen Freifall: andere Springer direkt vor der Kamera ausblenden
    const me = game.player;
    if (v.root.visible && !f.isPlayer && me.phase === 'fall' && me.z > CHUTE_Z && f.phase === 'fall'
      && this.camera.position.distanceTo(new THREE.Vector3(f.x * S, f.z * S, f.y * S)) < 13) v.root.visible = false;
    v.root.position.set(f.x * S, f.z * S, f.y * S);
    const speed = Math.hypot(f.vx, f.vy);
    const falling = f.phase === 'fall';
    const freefall = falling && f.z > CHUTE_Z;
    // Bodenschatten: in der Luft weg, kurz vor der Landung wächst er am Boden heran
    if (falling) {
      const k = clamp01(1 - f.z / 140);
      v.shadow.visible = k > 0.02;
      v.shadow.position.y = -f.z * S + 0.04;
      v.shadow.scale.setScalar(0.7 * k);
    } else if (!v.shadow.visible || v.shadow.position.y !== 0.04) {
      v.shadow.visible = true;
      v.shadow.position.y = 0.04;
      v.shadow.scale.setScalar(0.7);
    }
    // Blickrichtung: am Fallschirm in Flugrichtung, sonst zur Zielrichtung
    // Freifall: Blick von der Kamera weg (Kopf zeigt im Bild nach oben, Füße zur Kamera)
    const wantYaw = freefall ? -Math.PI / 2 : falling && speed > 40 ? Math.atan2(f.vy, f.vx) : f.aim;
    if (freefall) v.yaw = wantYaw;
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
    v.chute.visible = falling && !freefall;
    const opening = v.chute.visible && v.chuteT < 1;
    if (v.chute.visible && v.chuteT === 0) {
      // Öffnen: kleine Stoff-Wolke über dem Kopf
      for (let i = 0; i < 6; i++) this.puff(f.x * S + (Math.random() - 0.5) * 2, f.z * S + 3.2, f.y * S + (Math.random() - 0.5) * 2, this.m.contrail, 0.5, 1.6, 0.6, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2);
    }
    v.chuteT = v.chute.visible ? Math.min(1, v.chuteT + dt / 0.7) : 0;
    if (v.chute.visible) {
      // Aufgehen: Leinen strecken sich (schmal und lang), dann bläht sich die Kappe mit Überschwingen auf
      const o = v.chuteT;
      const stretch = Math.min(1, o / 0.35), bloom = Math.max(0, (o - 0.2) / 0.8);
      const e = 1 - Math.pow(1 - bloom, 3);
      const over = 1 + Math.sin(bloom * Math.PI) * 0.14;
      v.chute.scale.set(lerp(0.12, 1, e) * over, lerp(0.25, 1, stretch), lerp(0.12, 1, e) * over);
    }
    if (falling) {
      // Schirm dreht mit der Figur und kippt in die Lenkrichtung
      // leichtes Pendeln um die Hände
      v.chute.rotation.x = Math.sin(this.time * 1.7 + f.id) * 0.025;
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
    const lk = falling ? 0.0011 : 0.0005;
    // Freifall: beim seitlichen Pendeln in die Kurve rollen
    v.lean.rotation.x = lerp(v.lean.rotation.x, freefall ? 0 : f.vy * lk, 0.12);
    v.lean.rotation.z = lerp(v.lean.rotation.z, -f.vx * (freefall ? 0.008 : lk), 0.12);
    // Ruck beim Öffnen: Körper pendelt kurz unter dem Schirm nach
    if (opening) v.lean.rotation.z += Math.sin(v.chuteT * Math.PI * 3) * (1 - v.chuteT) * 0.035;

    // niedergeschlagen: auf den Bauch fallen und langsam kriechen
    rig.body.rotation.z = lerp(rig.body.rotation.z, 0, 1 - Math.exp(-dt * 8));
    // kurzer Übergang: auf die Knie fallen bzw. wieder aufstehen (~0,35 s)
    v.kneel = Math.max(0, Math.min(1, v.kneel + (f.downed ? 1 : -1) * dt / 0.35));
    if (v.kneel > 0 && v.kneel < 1) {
      const e = v.kneel * v.kneel * (3 - 2 * v.kneel);
      poseCrawl(rig, v.walkT, 0);
      // erst in die Knie (Körper sinkt), dann nach vorne auf die Hände
      rig.body.position.y = -0.42 * Math.min(1, e * 1.7);
      rig.torso.rotation.z = -1.25 * Math.max(0, (e - 0.4) / 0.6);
      rig.head.rotation.z = 1.0 * Math.max(0, (e - 0.4) / 0.6);
      v.lean.rotation.set(0, 0, 0);
      return;
    }
    if (f.downed) {
      const crawl = Math.min(1, speed / 40);
      v.walkT += dt * (2 + crawl * 5);
      poseCrawl(rig, v.walkT, crawl);
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
    if (falling) {
      // Fahrtwind: Beine wehen entgegen der Flugrichtung (bezogen auf die Blickrichtung der Figur)
      const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw), sp = 180;
      const fwd = Math.max(-1, Math.min(1, (f.vx * cy + f.vy * sy) / sp));
      const side = Math.max(-1, Math.min(1, (-f.vx * sy + f.vy * cy) / sp));
      const kk = 1 - Math.exp(-dt * 4);
      v.legFwd = lerp(v.legFwd, fwd, kk);
      v.legSide = lerp(v.legSide, side, kk);
    } else { v.legFwd = 0; v.legSide = 0; }
    animateRig(rig, { punch: v.punchT, punchArm: v.punchArm, phase: v.walkT, amp: v.amp, aim: v.aimBlend, twoHanded: f.weapon.twoHanded, weapon: f.weapon.id, reload: v.reloadBlend, time: this.time + f.id, falling, freefall, legFwd: v.legFwd, legSide: v.legSide, freeK: clamp01((DROP_Z - f.z) / (DROP_Z - CHUTE_Z)) });
    if (v.squash && v.squash > 0) {
      // Landung: kurz stauchen und federnd zurück
      v.squash = Math.max(0, v.squash - dt * 3.5);
      if (ANIM.lively) {
        const q = Math.sin(v.squash * Math.PI) * v.squash;
        rig.body.scale.set(1 + q * 0.2, 1 - q * 0.28, 1 + q * 0.2);
      }
    }

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

  private goldCore = new THREE.MeshBasicMaterial({ color: 0xff7410, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  private goldGlow = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  private bulletMesh(wid: WeaponId, gold = false) {
    // goldene (legendäre) Waffen: leuchtend orangefarbener Kern mit goldenem Schein
    const pk = gold && wid !== 'rocket' ? wid + ':gold' : wid;
    const pool = this.bulletPools.get(pk) ?? [];
    this.bulletPools.set(pk, pool);
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
      } else if (pk !== wid) {
        const st = SHOT[wid];
        const g = new THREE.Group();
        const glowM = new THREE.Mesh(this.g.bullet, this.goldGlow);
        glowM.scale.set(st.len * 1.15, st.thick * 2.1, st.thick * 2.1);
        const core = new THREE.Mesh(this.g.bullet, this.goldCore);
        core.scale.set(st.len, st.thick * 1.05, st.thick * 1.05);
        g.add(glowM, core);
        m = g;
      } else {
        const st = SHOT[wid];
        const mesh = new THREE.Mesh(this.g.bullet, this.shotMat[wid]);
        mesh.scale.set(st.len, st.thick, st.thick);
        m = mesh;
      }
      m.userData.wid = pk;
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
        m = this.bulletMesh(b.wid, b.gold);
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
    this.progTrack.position.set(target.x * S, 0.14, target.y * S);
    this.progTrack.scale.setScalar(target.r);
    const key = String(container);
    if (!this.progMesh || key !== this.progKey) {
      const inner = container ? 0.9 : 0.74;
      const geo = new THREE.RingGeometry(inner, 1.04, 96, 1);
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
    // Anzeige läuft weich hinterher (gleicht ungleichmäßige Bildzeiten aus), springt aber nie zurück
    const want = Math.min(1, target.t);
    this.progShown = want < this.progShown - 0.05 ? want : lerp(this.progShown, want, 0.5);
    this.progMat.uniforms.uProg.value = this.progShown;
    this.progMat.uniforms.uColor.value.setHex(target.color);
    this.progMat.uniforms.uOpacity.value = container ? 0.95 : 0.6;
    this.progMesh.position.set(target.x * S, 0.15, target.y * S);
    this.progMesh.scale.setScalar(target.r);
  }

  private reloadMesh: THREE.Mesh | null = null;
  private reloadStep = -1;
  private reloadMat = arcMaterial(0xffd23f, 0.85);
  private updateReloadRing(game: Game) {
    const p = game.player;
    if (!p.alive || !p.reloading || p.phase !== 'ground') {
      if (this.reloadMesh) this.reloadMesh.visible = false;
      return;
    }
    const t = 1 - Math.max(0, p.reloadUntil - game.time) / p.weapon.reload;
    const steps = 1;
    if (!this.reloadMesh || steps !== this.reloadStep) {
      const geo = new THREE.RingGeometry(1.42, 1.56, 96, 1);
      this.reloadMesh = new THREE.Mesh(geo, this.reloadMat); this.reloadMesh.rotation.x = -Math.PI / 2; this.reloadMesh.renderOrder = 5;
      this.reloadStep = steps;
    }
    if (this.reloadMesh.parent !== this.world) this.world!.add(this.reloadMesh);
    this.reloadMesh.visible = true;
    this.reloadMat.uniforms.uProg.value = Math.min(1, t);
    this.reloadMesh.position.set(p.x * S, 0.15, p.y * S);
  }

  private reviveMesh: THREE.Mesh | null = null;
  private reviveMat = arcMaterial(0x5dff7a, 0.9);
  private updateReviveRing(game: Game) {
    let target: Fighter | null = null;
    for (const f of game.fighters) {
      if (f.alive && f.downed && f.team === game.player.team && f.reviveT > 0 && (!target || f.reviveT > target.reviveT)) target = f;
    }
    if (!target) { if (this.reviveMesh) this.reviveMesh.visible = false; return; }
    if (!this.reviveMesh) {
      this.reviveMesh = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.5, 96, 1), this.reviveMat);
      this.reviveMesh.rotation.x = -Math.PI / 2; this.reviveMesh.renderOrder = 5;
    }
    this.reviveMat.uniforms.uProg.value = Math.min(1, target.reviveT / 3.5);
    if (this.reviveMesh.parent !== this.world) this.world!.add(this.reviveMesh);
    this.reviveMesh.visible = true;
    this.reviveMesh.position.set(target.x * S, 0.15, target.y * S);
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
        // Schilde schauen zur Kamera und wiegen nur leicht hin und her, alles andere dreht sich
        v.item.rotation.y = v.face ? Math.sin(this.time * 1.8 + v.x) * 0.45 : this.time * 1.6 + v.x;
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
    // weit entfernte Bäume nicht zeichnen (große Karte: spart viele Draw-Calls)
    this.cullTrees(this.camTarget.x / S, this.camTarget.z / S, 1500 + this.camTarget.y * 40);
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

  private cullTrees(cx: number, cz: number, far: number) {
    const far2 = far * far;
    for (const c of this.canopies) {
      const vis = (c.x - cx) ** 2 + (c.y - cz) ** 2 < far2;
      if (c.meshes[0].visible !== vis) for (const m of c.meshes) m.visible = vis;
    }
  }

  /** Admin-Freiflug: Kamera frei im Raum (No-Clip), keine Runde, keine Figuren */
  renderFly(dtMs: number, pos: THREE.Vector3, yaw: number, pitch: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    this.time += dt;
    if (!this.flyMode) {
      this.flyMode = true;
      this.camera.fov = 72; this.camera.near = 0.05; this.camera.far = 900; this.camera.updateProjectionMatrix();
      this.scene.background = new THREE.Color(0x9fd4f2);
      this.scene.fog = new THREE.Fog(0x9fd4f2, 160, 420);
      for (const v of this.fighterViews.values()) v.root.visible = false;
      for (const v of this.dropViews.values()) v.root.visible = false;
      if (this.fppView) this.fppView.visible = false;
      // keine Zone im Freiflug (sonst ist alles als 'außerhalb' getönt)
      if (this.zoneMat) { this.zoneMat.uniforms.uR.value = 1e5; this.zoneMat.uniforms.uNR.value = 0; }
      if (this.zoneWall) this.zoneWall.visible = false;
    }
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = 160 + pos.y * 2.5; this.scene.fog.far = 420 + pos.y * 4; }
    // Schattenbereich wächst mit der Höhe, damit von oben keine Kante zu sehen ist
    const area = Math.min(300, 60 + pos.y * 1.3);
    const sc = this.sun.shadow.camera;
    if (sc.right !== area) { sc.left = sc.bottom = -area; sc.right = sc.top = area; sc.updateProjectionMatrix(); }
    this.camera.position.copy(pos);
    const cp = Math.cos(pitch);
    this.camera.lookAt(pos.x + Math.cos(yaw) * cp, pos.y + Math.sin(pitch), pos.z + Math.sin(yaw) * cp);
    // Schatten und Baum-Sichtweite um den Punkt vor der Kamera
    const ahead = Math.min(pos.y > 60 ? 0 : 40, 8 + pos.y * 0.6);
    this.camTarget.set(pos.x + Math.cos(yaw) * ahead, 0, pos.z + Math.sin(yaw) * ahead);
    this.cullTrees(pos.x / S, pos.z / S, 4200 + pos.y * 60);
    for (const f of this.propAnims) f(this.time, dt);
    this.updateSun();
    if (this.waterMat) this.waterMat.uniforms.uT.value = this.time;
    if (this.foamMat) this.foamMat.uniforms.uT.value = this.time;
    this.windTime.value = this.time;
    if (this.plane) this.plane.visible = false;
    if (this.playerRing) this.playerRing.visible = false;
    if (this.aimLine) this.aimLine.visible = false;
    this.renderer.render(this.scene, this.camera);
  }

  /** Freiflug beenden: Kamera wieder wie in der Lobby */
  endFly() {
    if (!this.flyMode) return;
    this.flyMode = false;
    this.fppMode = false;
    if (this.zoneWall) this.zoneWall.visible = true;
    this.camera.fov = 40; this.camera.near = 0.5; this.camera.far = 800; this.camera.updateProjectionMatrix();
    this.scene.background = null;
    this.scene.fog = null;
  }

  /** Schneefall / Blütenblätter je nach Gebiet, kühleres Licht im Schnee, Fußspuren im Schnee */
  private updateBiomeFx(game: Game, dt: number) {
    const w = this.weather;
    if (!w) return;
    const p = game.player, spec = !p.alive && game.spectate ? game.spectate : p;
    const reg = spec.phase === 'plane' ? null : this.regionAt(game, spec.x, spec.y);
    const want = reg === 'snow' ? 'snow' : reg === 'grove' ? 'grove' : '';
    if (want && want !== w.kind && w.a < 0.05) {
      w.kind = want;
      w.mat.color.setHex(want === 'snow' ? 0xffffff : 0xffb3d1);
      w.mat.size = want === 'snow' ? 0.32 : 0.42;
    }
    w.a = Math.max(0, Math.min(1, w.a + (want && want === w.kind ? dt : -dt) * 0.8));
    w.mat.opacity = w.a * 0.9;
    w.pts.visible = w.a > 0.01;
    if (w.pts.visible) {
      const pos = w.pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array, cx = this.camTarget.x, cz = this.camTarget.z;
      const fall = w.kind === 'snow' ? 2.6 : 1.4;
      for (let i = 0; i < w.vel.length; i++) {
        let x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
        y -= w.vel[i] * fall * dt;
        x += Math.sin(this.time * 0.9 + i) * dt * (w.kind === 'snow' ? 0.5 : 1.4) + dt * 0.6;
        z += Math.cos(this.time * 0.7 + i * 1.3) * dt * 0.4;
        if (y < 0) y += 30;
        // um die Kamera herum mitwandern
        if (x - cx > 40) x -= 80; else if (x - cx < -40) x += 80;
        if (z - cz > 40) z -= 80; else if (z - cz < -40) z += 80;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      pos.needsUpdate = true;
    }
    // Licht: im Schnee etwas kühler
    const cool = w.kind === 'snow' ? w.a : 0;
    this.sun.color.setHex(this.tod.sun).lerp(new THREE.Color(0xdde9ff), cool * 0.6);
    this.hemi.color.setHex(this.tod.sky).lerp(new THREE.Color(0xd6e6ff), cool * 0.5);
    // Fußspuren
    const st = this.steps;
    if (!st) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    for (const f of game.fighters) {
      if (!f.alive || f.phase !== 'ground' || !this.near(f.x, f.y, 45)) continue;
      const last = st.last.get(f.id);
      if (!last) { st.last.set(f.id, { x: f.x, y: f.y, side: 1 }); continue; }
      if (Math.hypot(f.x - last.x, f.y - last.y) < 26) continue;
      const ang = Math.atan2(f.y - last.y, f.x - last.x);
      last.x = f.x; last.y = f.y; last.side *= -1;
      if (this.regionAt(game, f.x, f.y) !== 'snow' || game.houseAt(f.x, f.y) >= 0) continue;
      const i = st.next; st.next = (st.next + 1) % st.age.length;
      st.age[i] = 0;
      const ox = -Math.sin(ang) * 0.22 * last.side, oz = Math.cos(ang) * 0.22 * last.side;
      q.setFromEuler(new THREE.Euler(0, -ang + Math.PI / 2, 0));
      m4.compose(ps.set(f.x * S + ox, 0.04, f.y * S + oz), q, sc.set(1, 1, 1));
      st.mesh.setMatrixAt(i, m4);
    }
    let dirty = false;
    for (let i = 0; i < st.age.length; i++) {
      if (st.age[i] > 8) continue;
      st.age[i] += dt;
      dirty = true;
      if (st.age[i] > 6) {
        st.mesh.getMatrixAt(i, m4); m4.decompose(ps, q, sc);
        const k = Math.max(0, 1 - (st.age[i] - 6) / 2);
        m4.compose(ps, q, sc.set(k, 1, k)); st.mesh.setMatrixAt(i, m4);
      }
    }
    if (dirty) st.mesh.instanceMatrix.needsUpdate = true;
  }

  private updateSun() {
    const t = this.camTarget;
    const o = this.tod.off;
    this.sun.position.set(t.x + o[0], o[1], t.z + o[2]);
    this.sun.target.position.set(t.x, 0, t.z);
  }

  /** Hände und Waffe vor der Kamera (Ich-Perspektive) */
  private updateViewModel(game: Game, dt: number) {
    const p = game.player;
    const show = this.fpp.on && p.alive && !p.downed;
    if (!show) { if (this.fppView) this.fppView.visible = false; return; }
    const key = p.weapon.id + p.weapon.tier + p.color;
    if (!this.fppView || this.fppWeapon !== key) {
      if (this.fppView) this.camera.remove(this.fppView);
      this.fppView = this.buildViewModel(p);
      this.fppWeapon = key;
      this.camera.add(this.fppView);
    }
    const vm = this.fppView;
    vm.visible = true;
    const v = this.fighterViews.get(p);
    if (v) {
      // die eigene Figur ist ausgeblendet: Rückstoß/Nachladen/Schlag hier weiterzählen
      v.recoil = Math.max(0, v.recoil - dt * 9);
      v.reloadBlend = lerp(v.reloadBlend, p.reloading ? 1 : 0, 1 - Math.exp(-dt * 12));
      v.punchT = Math.max(0, v.punchT - dt * 6);
    }
    const speed = Math.hypot(p.vx, p.vy);
    this.fppBob += dt * speed * 0.06;
    const bob = Math.min(1, speed / 140);
    const recoil = v ? v.recoil : 0;
    const reload = v ? v.reloadBlend : 0;
    const punch = v ? v.punchT : 0;
    vm.position.set(Math.cos(this.fppBob) * 0.012 * bob, -Math.abs(Math.sin(this.fppBob)) * 0.016 * bob - reload * 0.12, recoil * 0.06);
    vm.rotation.set(recoil * 0.12 + reload * -0.5, 0, reload * 0.35);
    const fist = vm.getObjectByName('punch');
    if (fist) fist.position.z = -Math.sin(Math.min(1, (1 - punch) * 1.6) * Math.PI) * 0.25 * (punch > 0 ? 1 : 0);
  }

  private buildViewModel(p: Fighter) {
    const g = new THREE.Group();
    const skin = this.charToon(0xf2c49b);
    const sleeve = this.charToon(p.color);
    const limb = (a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const m = new THREE.Mesh(this.g.cyl, mat);
      m.scale.set(r, len, r);
      m.position.copy(a).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      g.add(m);
    };
    const hand = (pos: THREE.Vector3) => { const h = new THREE.Mesh(this.g.flash, skin); h.scale.setScalar(0.035); h.position.copy(pos); g.add(h); return h; };
    if (p.weapon.id === 'fists') {
      for (const side of [1, -1]) {
        const grp = new THREE.Group();
        if (side === 1) grp.name = 'punch';
        const fistPos = new THREE.Vector3(0.13 * side, -0.16, -0.36);
        const elbow = new THREE.Vector3(0.24 * side, -0.32, -0.12);
        const tmp = new THREE.Group();
        g.add(grp);
        // Arm in eigener Gruppe, damit die rechte Faust nach vorne schlagen kann
        const save = g.children.length;
        limb(elbow, fistPos, 0.032, skin);
        limb(new THREE.Vector3(0.3 * side, -0.5, 0.05), elbow, 0.045, sleeve);
        const f = hand(fistPos); f.scale.setScalar(0.05);
        for (const c of g.children.slice(save)) grp.add(c);
        void tmp;
      }
      return g;
    }
    const gun = this.makeGun(p.weapon.id, p.weapon.tier, p.look.wrap);
    gun.scale.setScalar(0.3);
    gun.rotation.y = Math.PI / 2;
    // Griff (Waffen-Koordinaten ~ (0,-0.12,0)) an die rechte Hand
    gun.position.set(0.17, -0.16, -0.36);
    g.add(gun);
    gun.updateMatrix();
    const toCam = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(gun.matrix);
    const rHand = toCam(0.0, -0.12, 0), lHand = toCam(p.weapon.twoHanded ? 0.42 : 0.0, -0.08, p.weapon.twoHanded ? 0 : -0.06);
    hand(rHand); hand(lHand);
    limb(new THREE.Vector3(0.28, -0.42, 0.05), rHand, 0.03, skin);
    limb(new THREE.Vector3(0.32, -0.55, 0.15), new THREE.Vector3(0.28, -0.42, 0.05), 0.045, sleeve);
    const lEl = new THREE.Vector3(-0.12, -0.36, -0.12);
    limb(lEl, lHand, 0.03, skin);
    limb(new THREE.Vector3(-0.22, -0.55, 0.1), lEl, 0.045, sleeve);
    g.traverse((o) => { (o as THREE.Mesh).castShadow = false; });
    return g;
  }

  private updateCamera(game: Game, dt: number) {
    const p = game.player;
    // Ich-Perspektive: Kamera auf Augenhöhe, Blick per Maus/Wischen
    if (this.fpp.on !== this.fppMode) {
      this.fppMode = this.fpp.on;
      this.camera.fov = this.fpp.on ? 72 : 40;
      this.camera.near = this.fpp.on ? 0.05 : 0.5;
      this.camera.updateProjectionMatrix();
      this.scene.background = this.fpp.on ? new THREE.Color(0x9fd4f2) : null;
      this.scene.fog = this.fpp.on ? new THREE.Fog(0x9fd4f2, 70, 190) : null;
    }
    if (this.fpp.on) {
      this.updateViewModel(game, dt);
      this.camTarget.set(p.x * S, 0, p.y * S);
      this.shake = Math.max(0, this.shake - dt * 3);
      const sh = (Math.random() - 0.5) * this.shake * 0.15;
      const eye = new THREE.Vector3(p.x * S, 1.95 + Math.abs(Math.sin(this.fppBob)) * 0.04 * Math.min(1, Math.hypot(p.vx, p.vy) / 140), p.y * S);
      this.camera.position.copy(eye);
      const cp = Math.cos(this.fpp.pitch);
      this.camera.lookAt(eye.x + Math.cos(this.fpp.yaw) * cp, eye.y + Math.sin(this.fpp.pitch) + sh, eye.z + Math.sin(this.fpp.yaw) * cp);
      return;
    }
    if (this.fppView) this.fppView.visible = false;
    let tx: number, ty: number, tz: number, zoom: number;
    const spec = !p.alive && game.spectate ? game.spectate : null;
    if (spec) {
      tx = spec.x * S;
      tz = spec.y * S;
      ty = spec.z * S * 0.4;
      zoom = 1 + Math.min(1, spec.z / DROP_Z) * 0.8;
    } else if (p.phase === 'plane') {
      // Auswahlphase: Blick über die ganze Insel
      tx = W / 2;
      tz = W / 2;
      ty = 0;
      zoom = 3;
    } else {
      tx = p.x * S;
      tz = p.y * S;
      ty = p.z * S * 0.4;
      zoom = 1 + Math.min(1, p.z / DROP_Z) * 0.8;
      // beim Zielen etwas in Blickrichtung vorausschauen
      if (game.input.aim !== null && p.phase === 'ground') {
        const look = Math.min(6, p.weapon.range * S * 0.18);
        const la = game.input.aim;
        tx += Math.cos(la) * look;
        tz += Math.sin(la) * look;
      }
    }
    const free = !spec && p.phase === 'fall' && p.z > CHUTE_Z;
    if (free) {
      // Freifall: Kamera folgt der Figur weich von hinten oben (die Flugbahn bleibt gleich)
      let kf = 1 - Math.exp(-dt * 5);
      if (this.snapCam) { kf = 1; this.snapCam = false; }
      this.camTarget.x = lerp(this.camTarget.x, p.x * S, kf);
      this.camTarget.y = lerp(this.camTarget.y, p.z * S, kf);
      this.camTarget.z = lerp(this.camTarget.z, p.y * S, kf);
      this.pitch = lerp(this.pitch, (52 * Math.PI) / 180, kf);
      this.camDist = lerp(this.camDist || 16, 16, kf);
      this.camera.position.set(this.camTarget.x, this.camTarget.y + this.camDist * Math.sin(this.pitch), this.camTarget.z + this.camDist * Math.cos(this.pitch));
      this.camera.lookAt(this.camTarget);
      return;
    }
    let k = 1 - Math.exp(-dt * (p.phase === 'fall' ? 2.2 : 6));
    if (this.snapCam) { k = 1; this.snapCam = false; }
    this.camTarget.x = lerp(this.camTarget.x, tx, k);
    this.camTarget.y = lerp(this.camTarget.y, ty, k);
    this.camTarget.z = lerp(this.camTarget.z, tz, k);
    const air = p.phase === 'plane' ? 1 : Math.min(1, p.z / DROP_Z);
    this.pitch = lerp(this.pitch, lerp(PITCH, PITCH_AIR, air), k);
    // Abstand weich nachführen (nach dem Freifall zoomt die Kamera sanft heran)
    this.camDist = this.camDist > 0 ? lerp(this.camDist, this.baseDist * zoom, k) : this.baseDist * zoom;
    const dist = this.camDist;
    this.shake = Math.max(0, this.shake - dt * 3);
    const sx = (Math.random() - 0.5) * this.shake, sz = (Math.random() - 0.5) * this.shake;
    this.camera.position.set(this.camTarget.x + sx, this.camTarget.y + dist * Math.sin(this.pitch), this.camTarget.z + dist * Math.cos(this.pitch) + sz);
    this.camera.lookAt(this.camTarget.x + sx * 0.5, this.camTarget.y, this.camTarget.z + sz * 0.5);
  }

  renderMenu(dtMs: number) {
    const dt = dtMs / 1000;
    this.time += dt;
    // Lobby-Hintergrund: langsamer Kameraflug über die Insel, leicht schräg mit Horizont-Gefühl
    const a = this.time * 0.035;
    this.camTarget.set(W / 2, 0, W / 2);
    this.camera.position.set(W / 2 + Math.cos(a) * 78, 30 + Math.sin(this.time * 0.11) * 4, W / 2 + Math.sin(a) * 78);
    this.camera.lookAt(W / 2 + Math.cos(a + 0.6) * 20, 0, W / 2 + Math.sin(a + 0.6) * 20);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -80;
    sc.right = sc.top = 80;
    sc.updateProjectionMatrix();
    this.updateSun();
    if (this.waterMat) this.waterMat.uniforms.uT.value = this.time;
    if (this.foamMat) this.foamMat.uniforms.uT.value = this.time;
    this.windTime.value = this.time;
    if (this.plane) this.plane.visible = false;
    if (this.playerRing) this.playerRing.visible = false;
    if (this.aimLine) this.aimLine.visible = false;
    for (const f of this.propAnims) f(this.time, Math.min(dt, 0.05));
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
