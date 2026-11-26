import * as THREE from 'three';
import { S, WORLD, PLANE_Z, PLANE_TIME } from '../config';
import { Game, Fighter, GameEvent, Loot, Bullet } from '../sim/game';
import { WEAPONS, TIER_COLORS, WeaponId } from '../weapons';
import { LootKind } from '../mapgen';

const W = WORLD * S;
const WALL_H = 2.1;
const PITCH = (58 * Math.PI) / 180;
const PITCH_AIR = (74 * Math.PI) / 180;
const WATER = 0x3aa6dc;

// Farbpalette
const C = {
  grass: '#86c95a',
  grassLight: '#97d66a',
  grassDark: '#74b84c',
  path: '#d8b27a',
  pathLight: '#e4c48e',
  sand: '#ecd59a',
  floor: 0xc79a64,
  trunk: 0x8a5a36,
  leaves: [0x5cb84f, 0x4ea845, 0x66c257],
  bush: 0x4aa646,
  rock: 0xa9afb8,
  walls: [0xf6ead2, 0xe3eef5, 0xf3ddd2, 0xeaf2dc],
  roofs: [0xe2583e, 0x3d82dc, 0x2fa597, 0xeba13a],
  trim: 0x8b6a4a,
};

interface FighterView {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  bodyMat: THREE.MeshToonMaterial;
  gun: THREE.Group;
  chute: THREE.Group;
  feet: THREE.Mesh[];
  flash: number;
  weaponId: string;
  walkT: number;
  deadT: number;
}
interface Particle { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; vx: number; vy: number; vz: number; life: number; max: number }
interface LootView { root: THREE.Group; item: THREE.Group; pop: number; x: number; y: number }
interface CrateView { lid: THREE.Group; glow: THREE.Mesh; openT: number }
interface FadeView { meshes: THREE.Mesh[]; x: number; y: number; r: number; faded: boolean; normal: THREE.Material; fade: THREE.Material }
interface HouseView { roof: THREE.Group; roofMats: THREE.Material[]; wallMat: THREE.MeshToonMaterial; fade: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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

/** Einheits-Satteldach: Dreieck (Breite 1, Höhe 1) entlang Z extrudiert (Tiefe 1), zentriert */
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

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: THREE.Group | null = null;
  camTarget = new THREE.Vector3(W / 2, 0, W / 2);
  baseDist = 30;
  pitch = PITCH;
  private sun: THREE.DirectionalLight;

  private fighterViews = new Map<Fighter, FighterView>();
  private lootViews = new Map<number, LootView>();
  private crateViews = new Map<number, CrateView>();
  private bulletViews = new Map<Bullet, THREE.Mesh>();
  private bulletPool: THREE.Mesh[] = [];
  private particles: Particle[] = [];
  private flashes: { mesh: THREE.Mesh; life: number }[] = [];
  private canopies: FadeView[] = [];
  private bushes: FadeView[] = [];
  private houses: HouseView[] = [];
  private zoneMat!: THREE.ShaderMaterial;
  private wallMat!: THREE.ShaderMaterial;
  private zoneWall!: THREE.Mesh;
  private plane!: THREE.Group;
  private playerRing!: THREE.Mesh;
  private perRound: { dispose(): void }[] = [];
  private time = 0;
  private gradient: THREE.DataTexture;
  private toonCache = new Map<string, THREE.MeshToonMaterial>();

  private g = {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    circle: new THREE.CircleGeometry(1, 28),
    gable: gableGeometry(),
    rock: new THREE.DodecahedronGeometry(1, 0),
    blob: new THREE.IcosahedronGeometry(1, 1),
    trunk: new THREE.CylinderGeometry(0.28, 0.4, 1, 8),
    torso: new THREE.CapsuleGeometry(0.42, 0.42, 6, 14),
    head: new THREE.SphereGeometry(0.52, 20, 14),
    cap: new THREE.SphereGeometry(0.55, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    hand: new THREE.SphereGeometry(0.15, 10, 8),
    eye: new THREE.SphereGeometry(0.08, 8, 6),
    chute: new THREE.SphereGeometry(2.2, 18, 7, 0, Math.PI * 2, 0, Math.PI * 0.42),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
    ring: new THREE.RingGeometry(0.82, 1, 40),
    beam: new THREE.CylinderGeometry(0.35, 0.35, 1, 16, 1, true),
    particle: new THREE.BoxGeometry(0.16, 0.16, 0.16),
    bullet: new THREE.BoxGeometry(0.75, 0.12, 0.12),
    flash: new THREE.SphereGeometry(0.28, 8, 6),
  };

  private m: Record<string, THREE.Material> = {};
  private disc: Record<number, THREE.MeshBasicMaterial> = {};
  private beam: Record<number, THREE.MeshBasicMaterial> = {};
  private tier: Record<number, THREE.MeshToonMaterial> = {};
  private crateMat: THREE.MeshToonMaterial;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(WATER);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 700);

    // Cartoon-Schattierung mit 3 Helligkeitsstufen
    this.gradient = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
    this.gradient.minFilter = this.gradient.magFilter = THREE.NearestFilter;
    this.gradient.needsUpdate = true;

    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x6f8f55, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff3dc, 2.6);
    this.sun.castShadow = true;
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 600;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -38;
    sc.right = sc.top = 38;
    sc.near = 1;
    sc.far = 200;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    const toon = (c: number, o: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: this.gradient, ...o });
    this.m = {
      shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }),
      skin: toon(0xf7d2ad),
      black: toon(0x22232b),
      gun: toon(0x2e3138),
      pack: toon(0x8a5f36),
      trunk: toon(C.trunk),
      rock: toon(C.rock),
      leaves0: toon(C.leaves[0]),
      leaves1: toon(C.leaves[1]),
      leaves2: toon(C.leaves[2]),
      leavesFade: toon(C.leaves[0], { transparent: true, opacity: 0.28, depthWrite: false }),
      bush: toon(C.bush),
      bushFade: toon(C.bush, { transparent: true, opacity: 0.42, depthWrite: false }),
      bullet: new THREE.MeshBasicMaterial({ color: 0xfff3a8 }),
      flash: new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }),
      line: new THREE.LineBasicMaterial({ color: 0x3a3a3a }),
      planeBody: toon(0xf4f4f4),
      planeAccent: toon(0xe2583e),
      ammo: toon(0xffc23a),
      ammoTip: toon(0xc87a32),
      armor: toon(0x3d8cf0),
      armorLight: toon(0xb5dbff),
      white: toon(0xffffff),
      red: toon(0xe53935),
      trim: toon(C.trim),
      chimney: toon(0x9c6a52),
      playerRing: new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
      crateGlow: new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.4, depthWrite: false }),
      sandBase: toon(0xd9bf83),
      water: new THREE.MeshBasicMaterial({ color: WATER }),
      foam: new THREE.MeshBasicMaterial({ color: 0xbfe8f7, transparent: true, opacity: 0.55, depthWrite: false }),
    };
    for (const t of [1, 2, 3, 4]) {
      this.disc[t] = new THREE.MeshBasicMaterial({ color: TIER_COLORS[t], transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
      this.beam[t] = new THREE.MeshBasicMaterial({ color: TIER_COLORS[t], transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
      this.tier[t] = toon(TIER_COLORS[t]);
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

  private toon(color: number, transparent = false) {
    const key = `${color}-${transparent}`;
    let m = this.toonCache.get(key);
    if (!m) {
      m = new THREE.MeshToonMaterial({ color, gradientMap: this.gradient, transparent });
      this.toonCache.set(key, m);
    }
    return m;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.baseDist = 30 * Math.min(2.2, Math.max(1, 1.1 / this.camera.aspect));
  }

  // ---------- Boden ----------

  private groundTexture(game: Game) {
    const N = 2048, k = N / WORLD;
    return canvasTexture(N, N, (c) => {
      // Sandstrand
      c.fillStyle = C.sand;
      c.fillRect(0, 0, N, N);
      // Gras mit weichem Rand
      const inset = 70 * k;
      c.fillStyle = C.grass;
      c.beginPath();
      c.roundRect(inset, inset, N - inset * 2, N - inset * 2, 160 * k);
      c.fill();
      // Große, weiche Farbflächen
      const rnd = (() => { let s = game.map.seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
      for (let i = 0; i < 70; i++) {
        const x = rnd() * N, y = rnd() * N, r = (120 + rnd() * 260) * k;
        const gr = c.createRadialGradient(x, y, 0, x, y, r);
        const col = rnd() < 0.5 ? C.grassLight : C.grassDark;
        gr.addColorStop(0, col + 'aa');
        gr.addColorStop(1, col + '00');
        c.fillStyle = gr;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
      c.save();
      c.beginPath();
      c.roundRect(inset, inset, N - inset * 2, N - inset * 2, 160 * k);
      c.clip();
      // Wege zwischen den Häusern
      const hs = game.houses;
      const edges = new Set<string>();
      hs.forEach((a, i) => {
        const near = hs.map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 })).filter((o) => o.j !== i).sort((p, q) => p.d - q.d).slice(0, 2);
        for (const n of near) edges.add(i < n.j ? `${i}-${n.j}` : `${n.j}-${i}`);
      });
      const drawPaths = (width: number, color: string) => {
        c.strokeStyle = color;
        c.lineWidth = width * k;
        c.lineCap = 'round';
        c.lineJoin = 'round';
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
      drawPaths(64, C.path);
      drawPaths(40, C.pathLight);
      // Hof um jedes Haus
      for (const h of hs) {
        c.fillStyle = C.path;
        c.beginPath();
        c.roundRect((h.x - h.s / 2 - 40) * k, (h.y - h.s / 2 - 40) * k, (h.s + 80) * k, (h.s + 80) * k, 40 * k);
        c.fill();
      }
      // kleine Grasbüschel und Blumen
      for (let i = 0; i < 2600; i++) {
        const x = rnd() * N, y = rnd() * N;
        const v = rnd();
        if (v < 0.85) {
          c.strokeStyle = 'rgba(70,140,50,0.45)';
          c.lineWidth = 1.5;
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x - 2, y - 5);
          c.moveTo(x + 2, y);
          c.lineTo(x + 3, y - 5);
          c.stroke();
        } else {
          c.fillStyle = ['#ffffff', '#ffe066', '#ff8fb1'][Math.floor(rnd() * 3)];
          c.beginPath();
          c.arc(x, y, 2.2, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.restore();
    });
  }

  // ---------- Aufbau ----------

  build(game: Game) {
    if (this.world) this.scene.remove(this.world);
    this.perRound.forEach((m) => m.dispose());
    this.perRound = [];
    this.fighterViews.clear();
    this.lootViews.clear();
    this.crateViews.clear();
    this.bulletViews.clear();
    this.bulletPool = [];
    this.particles = [];
    this.flashes = [];
    this.canopies = [];
    this.bushes = [];
    this.houses = [];

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

    // Wasser, Inselsockel, Boden
    flat(add(this.g.plane, this.m.water, W / 2, -1.2, W / 2, 1600, 1600, 1)).receiveShadow = false;
    flat(add(this.g.plane, this.m.foam, W / 2, -1.15, W / 2, W + 5, W + 5, 1)).receiveShadow = false;
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

    for (const o of game.obstacles) {
      const x = o.x * S, z = o.y * S;
      if (o.kind === 'wall') {
        const hi = game.houseAt(o.x, o.y);
        const mat = hi >= 0 ? this.houses[hi].wallMat : this.toon(C.walls[0]);
        add(this.g.box, mat, x, WALL_H / 2, z, o.w * S, WALL_H, o.h * S);
      } else if (o.kind === 'rock') {
        const r = o.r * S;
        const m = add(this.g.rock, this.m.rock, x, r * 0.42, z, r, r * 0.78, r);
        m.rotation.set(Math.random() * 0.6, Math.random() * 6, Math.random() * 0.6);
      } else if (o.kind === 'tree') {
        add(this.g.trunk, this.m.trunk, x, 1.1, z, 1, 2.2, 1);
        const mats = [this.m.leaves0, this.m.leaves1, this.m.leaves2];
        const mat = mats[Math.floor(Math.random() * 3)];
        const big = add(this.g.blob, mat, x, 3.2, z, 2.1, 1.7, 2.1);
        const top = add(this.g.blob, mat, x + 0.3, 4.3, z - 0.25, 1.4, 1.2, 1.4);
        big.rotation.y = Math.random() * 6;
        this.canopies.push({ meshes: [big, top], x: o.x, y: o.y, r: 50, faded: false, normal: mat, fade: this.m.leavesFade });
      } else if (o.kind === 'crate') {
        const s = o.w * S;
        const glow = flat(add(this.g.ring, this.m.crateGlow, x, 0.05, z, s * 0.85, s * 0.85, 1));
        glow.receiveShadow = false;
        add(this.g.box, this.crateMat, x, 0.72, z, s, 1.44, s);
        const lid = new THREE.Group();
        lid.position.set(x, 1.44, z - s / 2);
        add(this.g.box, this.crateMat, 0, 0.12, s / 2, s + 0.12, 0.24, s + 0.12, lid);
        world.add(lid);
        this.crateViews.set(o.id, { lid, glow, openT: 0 });
      }
    }

    for (const b of game.bushes) {
      const x = b.x * S, z = b.y * S, r = b.r * S;
      const parts = [
        add(this.g.blob, this.m.bush, x, 0.75, z, r * 0.72, r * 0.6, r * 0.72),
        add(this.g.blob, this.m.bush, x - r * 0.42, 0.62, z + r * 0.22, r * 0.5, r * 0.45, r * 0.5),
        add(this.g.blob, this.m.bush, x + r * 0.42, 0.66, z - r * 0.18, r * 0.52, r * 0.48, r * 0.52),
      ];
      this.bushes.push({ meshes: parts, x: b.x, y: b.y, r: b.r, faded: false, normal: this.m.bush, fade: this.m.bushFade });
    }

    for (const l of game.loot) this.addLoot(l, false);
    for (const f of game.fighters) this.addFighter(f);

    // Zone: Bodenschicht + Wand mit Farbverlauf
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
    this.zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 10, 96, 1, true), this.wallMat);
    this.zoneWall.renderOrder = 3;
    world.add(this.zoneWall);

    // Flugzeug
    const pl = new THREE.Group();
    const fus = add(this.g.cyl, this.m.planeBody, 0, 0, 0, 1.1, 9, 1.1, pl);
    fus.rotation.z = Math.PI / 2;
    const nose = add(this.g.head, this.m.planeAccent, 4.5, 0, 0, 2.1, 2.1, 2.1, pl);
    nose.scale.set(2.1, 2.1, 2.1);
    add(this.g.box, this.m.planeBody, 0.5, 0, 0, 2.4, 0.2, 13, pl);
    add(this.g.box, this.m.planeAccent, 0.5, 0.12, 0, 2.5, 0.1, 13.1, pl);
    add(this.g.box, this.m.planeAccent, -4, 1.2, 0, 1.4, 2.2, 0.2, pl);
    add(this.g.box, this.m.planeBody, -4, 0.3, 0, 1.2, 0.15, 4.5, pl);
    world.add(pl);
    this.plane = pl;

    this.playerRing = flat(add(this.g.ring, this.m.playerRing, 0, 0.06, 0, 1.25, 1.25, 1));
    this.playerRing.receiveShadow = false;
  }

  private makeGun(id: WeaponId) {
    const w = WEAPONS[id];
    const len = w.length * 0.035;
    const g = new THREE.Group();
    const part = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number) => {
      const m = new THREE.Mesh(this.g.box, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, 0);
      m.castShadow = true;
      g.add(m);
    };
    part(this.m.gun, len, 0.17, 0.17, len / 2, 0);
    part(this.tier[w.tier], len * 0.45, 0.07, 0.19, len * 0.35, 0.08);
    part(this.m.gun, 0.14, 0.3, 0.14, 0.12, -0.18);
    return g;
  }

  private addFighter(f: Fighter) {
    const root = new THREE.Group();
    const shadow = new THREE.Mesh(this.g.circle, this.m.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.04;
    shadow.scale.setScalar(0.75);
    const body = new THREE.Group();
    const bodyMat = new THREE.MeshToonMaterial({ color: f.color, gradientMap: this.gradient });
    const capMat = new THREE.MeshToonMaterial({ color: new THREE.Color(f.color).multiplyScalar(0.6), gradientMap: this.gradient });
    this.perRound.push(bodyMat, capMat);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      body.add(m);
      return m;
    };
    const torso = mk(this.g.torso, bodyMat, 0, 0.92, 0);
    mk(this.g.head, this.m.skin, 0, 1.82, 0);
    mk(this.g.cap, capMat, -0.02, 1.9, 0);
    mk(this.g.eye, this.m.black, 0.46, 1.86, 0.18);
    mk(this.g.eye, this.m.black, 0.46, 1.86, -0.18);
    const pack = mk(this.g.box, this.m.pack, -0.48, 1.0, 0);
    pack.scale.set(0.3, 0.55, 0.6);
    mk(this.g.hand, this.m.skin, 0.42, 1.0, 0.3);
    mk(this.g.hand, this.m.skin, 0.6, 1.02, 0.12);
    const feet = [0.2, -0.2].map((zz) => {
      const ft = mk(this.g.box, this.m.black, 0, 0.09, zz);
      ft.scale.set(0.36, 0.18, 0.24);
      return ft;
    });
    const gun = this.makeGun(f.weapon.id);
    gun.position.set(0.4, 1.05, 0.3);
    body.add(gun);

    const chute = new THREE.Group();
    const chuteMat = new THREE.MeshToonMaterial({ color: f.color, gradientMap: this.gradient, side: THREE.DoubleSide });
    this.perRound.push(chuteMat);
    const canopy = new THREE.Mesh(this.g.chute, chuteMat);
    canopy.position.y = 3.2;
    canopy.castShadow = true;
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push(Math.cos(a) * 2.0, 4.0, Math.sin(a) * 2.0, 0, 1.4, 0);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.perRound.push(lg);
    chute.add(canopy, new THREE.LineSegments(lg, this.m.line));
    chute.visible = false;

    root.add(shadow, body, chute);
    this.world!.add(root);
    this.fighterViews.set(f, { root, body, torso, bodyMat, gun, chute, feet, flash: 0, weaponId: f.weapon.id, walkT: Math.random() * 6, deadT: 0 });
  }

  private addLoot(l: Loot, pop: boolean) {
    const root = new THREE.Group();
    root.position.set(l.x * S, 0, l.y * S);
    const tier = this.lootTier(l.kind);
    const ring = new THREE.Mesh(this.g.ring, this.disc[tier]);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.scale.setScalar(0.8);
    root.add(ring);
    if (tier >= 3) {
      const beam = new THREE.Mesh(this.g.beam, this.beam[tier]);
      beam.scale.set(1, 3.2, 1);
      beam.position.y = 1.6;
      root.add(beam);
    }
    const item = new THREE.Group();
    item.position.y = 0.75;
    const box = (mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(this.g.box, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.castShadow = true;
      item.add(m);
    };
    if (l.kind.startsWith('w:')) {
      const g = this.makeGun(l.kind.slice(2) as WeaponId);
      g.scale.setScalar(1.3);
      g.position.x = -0.55;
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
      box(this.m.armor, 0.7, 0.8, 0.28);
      box(this.m.armorLight, 0.3, 0.3, 0.3, 0, 0.12, 0);
    } else {
      box(this.m.white, 0.72, 0.46, 0.5);
      box(this.m.red, 0.14, 0.04, 0.4, 0, 0.24, 0);
      box(this.m.red, 0.46, 0.04, 0.14, 0, 0.24, 0);
    }
    root.add(item);
    if (pop) root.scale.setScalar(0.01);
    this.world!.add(root);
    this.lootViews.set(l.id, { root, item, pop: pop ? 0 : 1, x: l.x, y: l.y });
  }

  private lootTier(k: LootKind) {
    if (k.startsWith('w:')) return WEAPONS[k.slice(2) as WeaponId].tier;
    return k === 'armor' ? 3 : k === 'medkit' ? 2 : 1;
  }

  // ---------- Ereignisse ----------

  handle(events: GameEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const m = new THREE.Mesh(this.g.flash, this.m.flash);
          m.position.set(e.x * S, 1.05, e.y * S);
          this.world!.add(m);
          this.flashes.push({ mesh: m, life: 0.06 });
          break;
        }
        case 'hit':
          this.burst(e.x, e.y, 1.0, e.color, e.big ? 5 : 3, 4);
          break;
        case 'kill':
          this.burst(e.f.x, e.f.y, 1.0, e.f.color, 16, 7);
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
          }
          this.burst(e.o.x, e.o.y, 1.6, 0xffd54a, 14, 6);
          break;
        }
        case 'damage': {
          const v = this.fighterViews.get(e.f);
          if (v) v.flash = 1;
          break;
        }
        case 'land':
          this.burst(e.f.x, e.f.y, 0.1, 0xd8c08f, 10, 4);
          break;
      }
    }
  }

  private burst(x: number, y: number, h: number, color: number, n: number, speed: number) {
    if (Math.abs(x * S - this.camTarget.x) > 45 || Math.abs(y * S - this.camTarget.z) > 45) return;
    for (let i = 0; i < n; i++) {
      let p = this.particles.find((q) => q.life <= 0);
      if (!p) {
        if (this.particles.length > 220) return;
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

  // ---------- Bild ----------

  render(game: Game, dtMs: number) {
    const dt = Math.min(dtMs, 50) / 1000;
    this.time += dt;
    const p = game.player;
    const playerHouse = p.alive && p.phase === 'ground' ? game.houseAt(p.x, p.y) : -1;

    for (const f of game.fighters) {
      const v = this.fighterViews.get(f);
      if (!v) continue;
      if (v.weaponId !== f.weapon.id) {
        v.body.remove(v.gun);
        v.gun = this.makeGun(f.weapon.id);
        v.gun.position.set(0.4, 1.05, 0.3);
        v.body.add(v.gun);
        v.weaponId = f.weapon.id;
      }
      if (!f.alive) {
        if (v.deadT < 1) {
          v.deadT = Math.min(1, v.deadT + dt * 2.5);
          v.root.scale.setScalar(1 - v.deadT * 0.9);
          v.body.rotation.z = v.deadT * 1.4;
          if (v.deadT >= 1) v.root.visible = false;
        }
        continue;
      }
      const house = f.phase === 'ground' ? game.houseAt(f.x, f.y) : -1;
      const inOtherHouse = !f.isPlayer && house !== -1 && house !== playerHouse;
      v.root.visible = f.phase !== 'plane' && !f.hidden && !inOtherHouse;
      v.root.position.set(f.x * S, f.z * S, f.y * S);
      v.body.rotation.y = -f.aim;
      v.chute.visible = f.phase === 'fall';
      if (f.phase === 'fall') {
        v.chute.rotation.z = Math.sin(this.time * 2 + f.id) * 0.08;
        v.body.rotation.z = Math.sin(this.time * 3 + f.id) * 0.06;
      } else {
        v.body.rotation.z = 0;
      }
      if (f.moving) {
        v.walkT += dt * 13;
        const s = Math.sin(v.walkT);
        v.feet[0].position.x = s * 0.24;
        v.feet[1].position.x = -s * 0.24;
        v.torso.position.y = 0.92 + Math.abs(s) * 0.07;
      } else {
        v.feet[0].position.x = v.feet[1].position.x = 0;
        v.torso.position.y = 0.92 + Math.sin(this.time * 2.5 + f.id) * 0.02;
      }
      if (v.flash > 0) {
        v.flash = Math.max(0, v.flash - dt * 9);
        v.bodyMat.emissive.setRGB(v.flash, v.flash, v.flash);
      } else if (f.healUntil) {
        const k = 0.25 + Math.sin(this.time * 10) * 0.1;
        v.bodyMat.emissive.setRGB(0, k, 0);
      } else {
        v.bodyMat.emissive.setRGB(0, 0, 0);
      }
    }

    this.playerRing.visible = p.alive && p.phase === 'ground';
    this.playerRing.position.set(p.x * S, 0.06, p.y * S);
    this.playerRing.rotation.z = this.time;

    // Geschosse
    const live = new Set(game.bullets);
    for (const [b, m] of this.bulletViews) {
      if (!live.has(b)) {
        m.visible = false;
        this.bulletPool.push(m);
        this.bulletViews.delete(b);
      }
    }
    for (const b of game.bullets) {
      let m = this.bulletViews.get(b);
      if (!m) {
        m = this.bulletPool.pop();
        if (!m) {
          m = new THREE.Mesh(this.g.bullet, this.m.bullet);
          this.world!.add(m);
        }
        m.visible = true;
        m.rotation.y = -Math.atan2(b.vy, b.vx);
        this.bulletViews.set(b, m);
      }
      m.position.set(b.x * S, 1.05, b.y * S);
    }

    // Loot
    for (const v of this.lootViews.values()) {
      if (v.pop < 1) {
        v.pop = Math.min(1, v.pop + dt * 4);
        v.root.scale.setScalar(Math.max(0.01, v.pop * (1 + Math.sin(v.pop * Math.PI) * 0.3)));
      }
      if (Math.abs(v.x * S - this.camTarget.x) < 40 && Math.abs(v.y * S - this.camTarget.z) < 40) {
        v.item.rotation.y = this.time * 1.6 + v.x;
        v.item.position.y = 0.75 + Math.sin(this.time * 3 + v.y) * 0.12;
      }
    }

    // Kisten
    for (const v of this.crateViews.values()) {
      if (v.openT > 0 && v.openT < 1) {
        v.openT = Math.min(1, v.openT + dt * 3);
        v.lid.rotation.x = -(1 - (1 - v.openT) ** 3) * 1.9;
      } else if (v.openT === 0) {
        (v.glow.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(this.time * 4) * 0.15;
      }
    }

    // Partikel & Mündungsfeuer
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
    this.flashes = this.flashes.filter((fl) => {
      fl.life -= dt;
      if (fl.life <= 0) {
        this.world!.remove(fl.mesh);
        return false;
      }
      return true;
    });

    // Bäume/Büsche durchsichtig in Spielernähe
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
    fade(this.bushes, 0.95);

    // Häuser: Dach und Wände blenden beim Betreten weich aus
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
      }
      h.roof.visible = roofA > 0.02;
      h.wallMat.transparent = wallA < 1;
      h.wallMat.opacity = wallA;
      h.wallMat.depthWrite = wallA >= 1;
    });

    // Zone
    const zc = game.zoneCur, zn = game.zoneNext;
    this.zoneMat.uniforms.uC.value.set(zc.x * S, zc.y * S);
    this.zoneMat.uniforms.uR.value = zc.r * S;
    this.zoneMat.uniforms.uN.value.set(zn.x * S, zn.y * S);
    this.zoneMat.uniforms.uNR.value = game.zoneState !== 'done' ? zn.r * S : 0;
    this.wallMat.uniforms.uT.value = this.time;
    this.zoneWall.position.set(zc.x * S, 5, zc.y * S);
    this.zoneWall.scale.set(Math.max(0.01, zc.r * S), 1, Math.max(0.01, zc.r * S));

    // Flugzeug
    const t = game.time / PLANE_TIME;
    const pp = game.plane;
    this.plane.visible = t < 1.25;
    this.plane.position.set(lerp(pp.x1, pp.x2, t) * S, PLANE_Z * S, lerp(pp.y1, pp.y2, t) * S);
    this.plane.rotation.y = -Math.atan2(pp.y2 - pp.y1, pp.x2 - pp.x1);
    this.plane.rotation.x = Math.sin(this.time * 1.5) * 0.04;

    this.updateCamera(game, dt);
    this.updateSun();
    this.renderer.render(this.scene, this.camera);
  }

  private updateSun() {
    const t = this.camTarget;
    this.sun.position.set(t.x - 30, 70, t.z + 22);
    this.sun.target.position.set(t.x, 0, t.z);
  }

  private updateCamera(game: Game, dt: number) {
    const p = game.player;
    let tx: number, ty: number, tz: number, zoom: number;
    if (p.phase === 'plane') {
      tx = this.plane.position.x;
      tz = this.plane.position.z;
      ty = PLANE_Z * S * 0.4;
      zoom = 1.8;
    } else {
      tx = p.x * S;
      tz = p.y * S;
      ty = p.z * S * 0.4;
      zoom = 1 + Math.min(1, p.z / PLANE_Z) * 0.8;
    }
    const k = 1 - Math.exp(-dt * 7);
    this.camTarget.x = lerp(this.camTarget.x, tx, k);
    this.camTarget.y = lerp(this.camTarget.y, ty, k);
    this.camTarget.z = lerp(this.camTarget.z, tz, k);
    const air = p.phase === 'plane' ? 1 : Math.min(1, p.z / PLANE_Z);
    this.pitch = lerp(this.pitch, lerp(PITCH, PITCH_AIR, air), k);
    const dist = this.baseDist * zoom;
    this.camera.position.set(this.camTarget.x, this.camTarget.y + dist * Math.sin(this.pitch), this.camTarget.z + dist * Math.cos(this.pitch));
    this.camera.lookAt(this.camTarget);
  }

  /** Hintergrund fürs Menü: Kamera kreist langsam über der Insel */
  renderMenu(dtMs: number) {
    this.time += dtMs / 1000;
    const a = this.time * 0.05;
    this.camTarget.set(W / 2, 0, W / 2);
    this.camera.position.set(W / 2 + Math.cos(a) * 60, 42, W / 2 + Math.sin(a) * 60);
    this.camera.lookAt(W / 2, 0, W / 2);
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -80;
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 80;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.updateSun();
    if (this.plane) this.plane.visible = false;
    if (this.playerRing) this.playerRing.visible = false;
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

  fighterVisible(f: Fighter) {
    const v = this.fighterViews.get(f);
    return !!v && v.root.visible;
  }
}
