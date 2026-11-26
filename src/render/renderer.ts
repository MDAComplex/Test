import * as THREE from 'three';
import { S, WORLD, PLANE_Z, PLANE_TIME } from '../config';
import { Game, Fighter, GameEvent, Loot, Bullet } from '../sim/game';
import { WEAPONS, TIER_COLORS, WeaponId } from '../weapons';
import { LootKind } from '../mapgen';

const W = WORLD * S;
const WALL_H = 2.0;
const PITCH = (58 * Math.PI) / 180;
const PITCH_AIR = (74 * Math.PI) / 180;

interface FighterView {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  bodyMat: THREE.MeshLambertMaterial;
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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world: THREE.Group | null = null;
  camTarget = new THREE.Vector3(W / 2, 0, W / 2);
  baseDist = 30;
  pitch = PITCH;

  private fighterViews = new Map<Fighter, FighterView>();
  private lootViews = new Map<number, LootView>();
  private crateViews = new Map<number, CrateView>();
  private bulletViews = new Map<Bullet, THREE.Mesh>();
  private bulletPool: THREE.Mesh[] = [];
  private particles: Particle[] = [];
  private flashes: { mesh: THREE.Mesh; life: number }[] = [];
  private canopies: FadeView[] = [];
  private bushes: FadeView[] = [];
  private roofs: { mesh: THREE.Object3D; index: number }[] = [];
  private zoneMat!: THREE.ShaderMaterial;
  private zoneWall!: THREE.Mesh;
  private plane!: THREE.Group;
  private playerRing!: THREE.Mesh;
  private perRound: THREE.Material[] = [];
  private time = 0;

  // geteilte Geometrien
  private g = {
    box: new THREE.BoxGeometry(1, 1, 1),
    plane: new THREE.PlaneGeometry(1, 1),
    circle: new THREE.CircleGeometry(1, 24),
    cone4: new THREE.ConeGeometry(1, 1, 4),
    rock: new THREE.DodecahedronGeometry(1, 0),
    blob: new THREE.IcosahedronGeometry(1, 0),
    trunk: new THREE.CylinderGeometry(0.35, 0.45, 1, 7),
    capsule: new THREE.CapsuleGeometry(0.48, 0.55, 4, 10),
    head: new THREE.SphereGeometry(0.46, 14, 10),
    cap: new THREE.SphereGeometry(0.49, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    eye: new THREE.SphereGeometry(0.075, 6, 5),
    chute: new THREE.SphereGeometry(2.2, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.42),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
    ring: new THREE.RingGeometry(1.15, 1.38, 36),
    particle: new THREE.BoxGeometry(0.16, 0.16, 0.16),
    bullet: new THREE.BoxGeometry(0.7, 0.12, 0.12),
    flash: new THREE.SphereGeometry(0.28, 8, 6),
  };

  // geteilte Materialien
  private m = {
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }),
    skin: new THREE.MeshLambertMaterial({ color: 0xf5cfa6 }),
    black: new THREE.MeshLambertMaterial({ color: 0x1b1b22 }),
    gun: new THREE.MeshLambertMaterial({ color: 0x2b2e35 }),
    pack: new THREE.MeshLambertMaterial({ color: 0x7a5530 }),
    wall: new THREE.MeshLambertMaterial({ color: 0xe6d6b6 }),
    wallTop: new THREE.MeshLambertMaterial({ color: 0xb59f7c }),
    floor: new THREE.MeshLambertMaterial({ color: 0xa7835a }),
    roof: new THREE.MeshLambertMaterial({ color: 0xc0573e, flatShading: true }),
    rock: new THREE.MeshLambertMaterial({ color: 0x8e939b, flatShading: true }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x7a5232 }),
    canopy: new THREE.MeshLambertMaterial({ color: 0x3f9a45, flatShading: true }),
    canopyDark: new THREE.MeshLambertMaterial({ color: 0x2f7d36, flatShading: true }),
    canopyFade: new THREE.MeshLambertMaterial({ color: 0x3f9a45, flatShading: true, transparent: true, opacity: 0.3, depthWrite: false }),
    bush: new THREE.MeshLambertMaterial({ color: 0x2f8a3a, flatShading: true }),
    bushFade: new THREE.MeshLambertMaterial({ color: 0x2f8a3a, flatShading: true, transparent: true, opacity: 0.45, depthWrite: false }),
    bullet: new THREE.MeshBasicMaterial({ color: 0xfff1a0 }),
    flash: new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.9 }),
    line: new THREE.LineBasicMaterial({ color: 0x333333 }),
    planeBody: new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }),
    planeAccent: new THREE.MeshLambertMaterial({ color: 0x2f6fd0 }),
    ammo: new THREE.MeshLambertMaterial({ color: 0xffc107 }),
    ammoTip: new THREE.MeshLambertMaterial({ color: 0xc8742a }),
    armor: new THREE.MeshLambertMaterial({ color: 0x3d8cf0 }),
    armorLight: new THREE.MeshLambertMaterial({ color: 0xa9d4ff }),
    white: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    red: new THREE.MeshLambertMaterial({ color: 0xe53935 }),
    playerRing: new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    crate: new THREE.MeshLambertMaterial(),
    crateGlow: new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.35, depthWrite: false }),
    disc: {} as Record<number, THREE.MeshBasicMaterial>,
    tier: {} as Record<number, THREE.MeshLambertMaterial>,
  };

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x2c4a2a);
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 600);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x50704a, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-40, 100, 50);
    this.scene.add(sun);

    for (const t of [1, 2, 3, 4]) {
      this.m.disc[t] = new THREE.MeshBasicMaterial({ color: TIER_COLORS[t], transparent: true, opacity: 0.45, depthWrite: false });
      this.m.tier[t] = new THREE.MeshLambertMaterial({ color: TIER_COLORS[t] });
    }
    this.m.crate.map = canvasTexture(128, (c) => {
      c.fillStyle = '#c58b45';
      c.fillRect(0, 0, 128, 128);
      c.strokeStyle = '#9b6a32';
      c.lineWidth = 3;
      for (let y = 26; y < 128; y += 26) { c.beginPath(); c.moveTo(0, y); c.lineTo(128, y); c.stroke(); }
      c.strokeStyle = '#6e4a22';
      c.lineWidth = 12;
      c.strokeRect(6, 6, 116, 116);
      c.lineWidth = 10;
      c.beginPath(); c.moveTo(10, 10); c.lineTo(118, 118); c.stroke();
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
    this.roofs = [];

    const world = new THREE.Group();
    this.world = world;
    this.scene.add(world);
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, parent: THREE.Object3D = world) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      parent.add(mesh);
      return mesh;
    };
    const flat = (mesh: THREE.Mesh) => { mesh.rotation.x = -Math.PI / 2; return mesh; };

    // Boden
    flat(add(this.g.plane, new THREE.MeshLambertMaterial({ color: 0x3a6332 }), W / 2, -0.05, W / 2, 1200, 1200, 1));
    const grass = canvasTexture(256, (c) => {
      c.fillStyle = '#6aac4c';
      c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 500; i++) {
        c.fillStyle = Math.random() < 0.5 ? 'rgba(90,150,62,0.7)' : 'rgba(126,190,92,0.7)';
        c.beginPath();
        c.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 7, 0, Math.PI * 2);
        c.fill();
      }
    });
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    grass.repeat.set(W / 10, W / 10);
    const groundMat = new THREE.MeshLambertMaterial({ map: grass });
    this.perRound.push(groundMat);
    flat(add(this.g.plane, groundMat, W / 2, 0, W / 2, W, W, 1));

    // Häuser: Boden + Dach
    game.houses.forEach((h, i) => {
      const s = h.s * S;
      flat(add(this.g.plane, this.m.floor, h.x * S, 0.03, h.y * S, s, s, 1));
      const roof = new THREE.Group();
      add(this.g.box, this.m.wallTop, 0, WALL_H + 0.15, 0, s + 0.4, 0.3, s + 0.4, roof);
      const cone = add(this.g.cone4, this.m.roof, 0, WALL_H + 0.3 + 1.1, 0, s * 0.74, 2.2, s * 0.74, roof);
      cone.rotation.y = Math.PI / 4;
      roof.position.set(h.x * S, 0, h.y * S);
      world.add(roof);
      this.roofs.push({ mesh: roof, index: i });
    });

    for (const o of game.obstacles) {
      const x = o.x * S, z = o.y * S;
      if (o.kind === 'wall') {
        add(this.g.box, this.m.wall, x, WALL_H / 2, z, o.w * S, WALL_H, o.h * S);
        add(this.g.box, this.m.wallTop, x, WALL_H + 0.05, z, o.w * S + 0.05, 0.1, o.h * S + 0.05);
      } else if (o.kind === 'rock') {
        const r = o.r * S;
        flat(add(this.g.circle, this.m.shadow, x + 0.3, 0.02, z + 0.3, r * 1.1, r * 1.1, 1));
        const m = add(this.g.rock, this.m.rock, x, r * 0.45, z, r, r * 0.8, r);
        m.rotation.set(Math.random(), Math.random() * 6, Math.random());
      } else if (o.kind === 'tree') {
        flat(add(this.g.circle, this.m.shadow, x + 0.5, 0.02, z + 0.5, 2.0, 2.0, 1));
        add(this.g.trunk, this.m.trunk, x, 1.1, z, 1, 2.2, 1);
        const big = add(this.g.blob, this.m.canopy, x, 3.3, z, 2.1, 1.6, 2.1);
        const top = add(this.g.blob, this.m.canopy, x + 0.25, 4.3, z - 0.2, 1.35, 1.1, 1.35);
        big.rotation.y = Math.random() * 6;
        top.rotation.y = Math.random() * 6;
        this.canopies.push({ meshes: [big, top], x: o.x, y: o.y, r: 50, faded: false, normal: this.m.canopy, fade: this.m.canopyFade });
      } else if (o.kind === 'crate') {
        const s = o.w * S;
        flat(add(this.g.circle, this.m.shadow, x + 0.2, 0.02, z + 0.2, s * 0.8, s * 0.8, 1));
        const glow = flat(add(this.g.ring, this.m.crateGlow, x, 0.05, z, s * 0.75, s * 0.75, 1));
        add(this.g.box, this.m.crate, x, 0.72, z, s, 1.44, s);
        const lid = new THREE.Group();
        lid.position.set(x, 1.44, z - s / 2);
        add(this.g.box, this.m.crate, 0, 0.12, s / 2, s + 0.12, 0.24, s + 0.12, lid);
        world.add(lid);
        this.crateViews.set(o.id, { lid, glow, openT: 0 });
      }
    }

    for (const b of game.bushes) {
      const x = b.x * S, z = b.y * S, r = b.r * S;
      const parts = [
        add(this.g.blob, this.m.bush, x, 0.8, z, r * 0.75, r * 0.6, r * 0.75),
        add(this.g.blob, this.m.bush, x - r * 0.4, 0.7, z + r * 0.25, r * 0.5, r * 0.45, r * 0.5),
        add(this.g.blob, this.m.bush, x + r * 0.4, 0.75, z - r * 0.2, r * 0.55, r * 0.5, r * 0.55),
      ];
      parts.forEach((p) => (p.rotation.y = Math.random() * 6));
      this.bushes.push({ meshes: parts, x: b.x, y: b.y, r: b.r, faded: false, normal: this.m.bush, fade: this.m.bushFade });
    }

    for (const l of game.loot) this.addLoot(l, false);
    for (const f of game.fighters) this.addFighter(f);

    // Zone: Bodenschicht (Shader) + halbtransparente Wand
    this.zoneMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uC: { value: new THREE.Vector2() }, uR: { value: 0 }, uN: { value: new THREE.Vector2() }, uNR: { value: 0 } },
      vertexShader: `varying vec2 vXZ; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vXZ = wp.xz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform vec2 uC; uniform float uR; uniform vec2 uN; uniform float uNR; varying vec2 vXZ;
        void main(){
          float d = distance(vXZ, uC);
          vec4 col = vec4(0.0);
          if (d > uR) col = vec4(0.16, 0.3, 0.85, 0.38);
          float edge = 1.0 - smoothstep(0.0, 0.35, abs(d - uR));
          col = mix(col, vec4(0.55, 0.75, 1.0, 0.95), edge);
          if (uNR > 0.0) { float nl = 1.0 - smoothstep(0.0, 0.2, abs(distance(vXZ, uN) - uNR)); col = mix(col, vec4(1.0), nl * 0.9); }
          if (col.a < 0.01) discard;
          gl_FragColor = col;
        }`,
    });
    this.perRound.push(this.zoneMat);
    flat(add(this.g.plane, this.zoneMat, W / 2, 0.06, W / 2, W + 400, W + 400, 1)).renderOrder = 2;
    const wallMat = new THREE.MeshBasicMaterial({ color: 0x4f7dff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false });
    this.perRound.push(wallMat);
    this.zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 14, 72, 1, true), wallMat);
    this.zoneWall.renderOrder = 3;
    world.add(this.zoneWall);

    // Flugzeug
    const pl = new THREE.Group();
    const fus = add(this.g.cyl, this.m.planeBody, 0, 0, 0, 1.1, 9, 1.1, pl);
    fus.rotation.z = Math.PI / 2;
    const nose = add(this.g.head, this.m.planeAccent, 4.5, 0, 0, 2.3, 2.3, 2.3, pl);
    nose.scale.set(2.2, 2.2, 2.2);
    add(this.g.box, this.m.planeBody, 0.5, 0, 0, 2.4, 0.2, 13, pl);
    add(this.g.box, this.m.planeAccent, 0.5, 0.12, 0, 2.5, 0.1, 13.1, pl);
    add(this.g.box, this.m.planeBody, -4, 1.2, 0, 1.4, 2.2, 0.2, pl);
    add(this.g.box, this.m.planeBody, -4, 0.3, 0, 1.2, 0.15, 4.5, pl);
    world.add(pl);
    this.plane = pl;

    this.playerRing = flat(add(this.g.ring, this.m.playerRing, 0, 0.05, 0));
  }

  private makeGun(id: WeaponId) {
    const w = WEAPONS[id];
    const len = w.length * 0.035;
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.g.box, this.m.gun);
    body.scale.set(len, 0.17, 0.17);
    body.position.x = len / 2;
    const stripe = new THREE.Mesh(this.g.box, this.m.tier[w.tier]);
    stripe.scale.set(len * 0.45, 0.07, 0.19);
    stripe.position.set(len * 0.35, 0.08, 0);
    const grip = new THREE.Mesh(this.g.box, this.m.gun);
    grip.scale.set(0.14, 0.3, 0.14);
    grip.position.set(0.12, -0.18, 0);
    g.add(body, stripe, grip);
    return g;
  }

  private addFighter(f: Fighter) {
    const root = new THREE.Group();
    const shadow = new THREE.Mesh(this.g.circle, this.m.shadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    shadow.scale.setScalar(0.85);
    const body = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: f.color });
    const capMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(f.color).multiplyScalar(0.62) });
    this.perRound.push(bodyMat, capMat);
    const torso = new THREE.Mesh(this.g.capsule, bodyMat);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(this.g.head, this.m.skin);
    head.position.y = 1.86;
    const cap = new THREE.Mesh(this.g.cap, capMat);
    cap.position.y = 1.92;
    const e1 = new THREE.Mesh(this.g.eye, this.m.black);
    e1.position.set(0.41, 1.9, 0.16);
    const e2 = e1.clone();
    e2.position.z = -0.16;
    const pack = new THREE.Mesh(this.g.box, this.m.pack);
    pack.scale.set(0.3, 0.55, 0.62);
    pack.position.set(-0.52, 1.05, 0);
    const feet = [0.2, -0.2].map((zz) => {
      const ft = new THREE.Mesh(this.g.box, this.m.black);
      ft.scale.set(0.36, 0.18, 0.24);
      ft.position.set(0, 0.09, zz);
      return ft;
    });
    const gun = this.makeGun(f.weapon.id);
    gun.position.set(0.38, 1.05, 0.3);
    body.add(torso, head, cap, e1, e2, pack, gun, ...feet);

    const chute = new THREE.Group();
    const chuteMat = new THREE.MeshLambertMaterial({ color: f.color, side: THREE.DoubleSide });
    this.perRound.push(chuteMat);
    const canopy = new THREE.Mesh(this.g.chute, chuteMat);
    canopy.position.y = 3.2;
    const pts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      pts.push(Math.cos(a) * 2.0, 4.0, Math.sin(a) * 2.0, 0, 1.4, 0);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
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
    const disc = new THREE.Mesh(this.g.circle, this.m.disc[tier]);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.04;
    disc.scale.setScalar(0.75);
    const item = new THREE.Group();
    item.position.y = 0.7;
    const box = (mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(this.g.box, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      item.add(m);
    };
    if (l.kind.startsWith('w:')) {
      const g = this.makeGun(l.kind.slice(2) as WeaponId);
      g.scale.setScalar(1.25);
      g.position.x = -0.5;
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
    root.add(disc, item);
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
          this.burst(e.f.x, e.f.y, 0.1, 0xc8b48a, 10, 4);
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
    const playerHouse = p.phase === 'ground' ? game.houseAt(p.x, p.y) : -1;

    for (const f of game.fighters) {
      const v = this.fighterViews.get(f);
      if (!v) continue;
      if (v.weaponId !== f.weapon.id) {
        v.body.remove(v.gun);
        v.gun = this.makeGun(f.weapon.id);
        v.gun.position.set(0.38, 1.05, 0.3);
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
      const inOtherHouse = f.phase === 'ground' && !f.isPlayer && game.houseAt(f.x, f.y) !== playerHouse && game.houseAt(f.x, f.y) !== -1;
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
        v.torso.position.y = 1.0 + Math.abs(s) * 0.07;
      } else {
        v.feet[0].position.x = v.feet[1].position.x = 0;
        v.torso.position.y = 1.0;
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

    // Spielermarkierung
    this.playerRing.visible = p.alive && p.phase === 'ground';
    this.playerRing.position.set(p.x * S, 0.05, p.y * S);

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
        m = this.bulletPool.pop() ?? null!;
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

    // Loot drehen (nur in der Nähe)
    for (const v of this.lootViews.values()) {
      if (v.pop < 1) {
        v.pop = Math.min(1, v.pop + dt * 4);
        v.root.scale.setScalar(Math.max(0.01, 1 + Math.sin(v.pop * Math.PI) * 0.3 * (1 - v.pop)) * v.pop);
      }
      if (Math.abs(v.x * S - this.camTarget.x) < 40 && Math.abs(v.y * S - this.camTarget.z) < 40) {
        v.item.rotation.y = this.time * 1.6 + v.x;
        v.item.position.y = 0.7 + Math.sin(this.time * 3 + v.y) * 0.12;
      }
    }

    // Kisten öffnen
    for (const v of this.crateViews.values()) {
      if (v.openT > 0 && v.openT < 1) {
        v.openT = Math.min(1, v.openT + dt * 3);
        const t = 1 - (1 - v.openT) ** 3;
        v.lid.rotation.x = -t * 1.9;
      } else if (v.openT === 0) {
        (v.glow.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(this.time * 4) * 0.12;
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

    // Baumkronen / Büsche / Dächer durchsichtig in Spielernähe
    const fade = (list: FadeView[], k: number) => {
      for (const c of list) {
        const near = p.alive && p.phase === 'ground' && (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < (c.r * k) ** 2;
        if (near !== c.faded) {
          c.faded = near;
          for (const m of c.meshes) m.material = near ? c.fade : c.normal;
        }
      }
    };
    fade(this.canopies, 1.0);
    fade(this.bushes, 0.95);
    for (const r of this.roofs) r.mesh.visible = r.index !== playerHouse;

    // Zone
    const zc = game.zoneCur, zn = game.zoneNext;
    this.zoneMat.uniforms.uC.value.set(zc.x * S, zc.y * S);
    this.zoneMat.uniforms.uR.value = zc.r * S;
    this.zoneMat.uniforms.uN.value.set(zn.x * S, zn.y * S);
    this.zoneMat.uniforms.uNR.value = game.zoneState !== 'done' ? zn.r * S : 0;
    this.zoneWall.position.set(zc.x * S, 7, zc.y * S);
    this.zoneWall.scale.set(Math.max(0.01, zc.r * S), 1, Math.max(0.01, zc.r * S));

    // Flugzeug (fliegt über das Ende hinaus weiter)
    const t = game.time / PLANE_TIME;
    const pp = game.plane;
    this.plane.visible = t < 1.25;
    this.plane.position.set(lerp(pp.x1, pp.x2, t) * S, PLANE_Z * S, lerp(pp.y1, pp.y2, t) * S);
    this.plane.rotation.y = -Math.atan2(pp.y2 - pp.y1, pp.x2 - pp.x1);
    this.plane.rotation.x = Math.sin(this.time * 1.5) * 0.04;

    this.updateCamera(game, dt);
    this.renderer.render(this.scene, this.camera);
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

  /** Hintergrund fürs Menü: Kamera kreist langsam über der Karte */
  renderMenu(dtMs: number) {
    this.time += dtMs / 1000;
    const a = this.time * 0.05;
    this.camera.position.set(W / 2 + Math.cos(a) * 70, 55, W / 2 + Math.sin(a) * 70);
    this.camera.lookAt(W / 2, 0, W / 2);
    if (this.plane) this.plane.visible = false;
    this.renderer.render(this.scene, this.camera);
  }

  private v3 = new THREE.Vector3();
  /** Weltposition (Pixel-Koordinaten + Höhe in 3D-Einheiten) -> Bildschirm */
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
