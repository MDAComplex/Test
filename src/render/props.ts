import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { S, WORLD } from '../config';
import { PIERS, type MapData, type Prop } from '../mapgen';

/**
 * Requisiten der Karte (Deko je Biom). Statische Teile werden pro Material und Kartenbereich
 * zu wenigen Meshes zusammengefasst, bewegte Teile (Windräder, Rauch, Möwen …) bekommen eigene Gruppen.
 */
type Mat = THREE.Material;
type Col = number | Mat;
export interface PropCtx {
  world: THREE.Group;
  toon: (c: number) => Mat;
  /** Toon-Material mit Eckfarben */
  vcToon: Mat;
  water: Mat;
  anims: ((t: number, dt: number) => void)[];
  dispose: (THREE.BufferGeometry | Mat)[];
}

const CHUNKS = 4;
const unit = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 10, 6),
  blob: new THREE.IcosahedronGeometry(1, 0),
  blob1: new THREE.IcosahedronGeometry(1, 1),
  half: new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
};
const cylCache = new Map<string, THREE.BufferGeometry>();
const cylG = (rt: number, rb: number, seg: number, open = false) => {
  const k = `${rt}|${rb}|${seg}|${open}`;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, 1, seg, 1, open); cylCache.set(k, g); }
  return g;
};
let prismG: THREE.BufferGeometry | null = null;
/** Dreiecks-Prisma (Zelt, Dach): Grundfläche 1x1, Höhe 1, First entlang x */
const prism = () => {
  if (prismG) return prismG;
  const sh = new THREE.Shape(); sh.moveTo(-0.5, 0); sh.lineTo(0.5, 0); sh.lineTo(0, 1); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5); g.rotateY(Math.PI / 2);
  prismG = g;
  return g;
};

class Builder {
  base = new THREE.Matrix4();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  constructor(private sink: (g: THREE.BufferGeometry, m: Mat, mat: THREE.Matrix4, x: number, z: number) => void, private col: (c: Col) => Mat) {}
  wx = 0; wz = 0;
  at(x: number, y: number, a = 0, s = 1, h = 0) {
    this.wx = x; this.wz = y;
    this.q.setFromEuler(this.e.set(0, -a, 0));
    this.base.compose(new THREE.Vector3(x * S, h, y * S), this.q, new THREE.Vector3(s, s, s));
    return this;
  }
  geo(g: THREE.BufferGeometry, c: Col, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    this.q.setFromEuler(this.e.set(rx, ry, rz));
    this.tmp.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    this.sink(g, this.col(c), new THREE.Matrix4().multiplyMatrices(this.base, this.tmp), this.wx, this.wz);
    return this;
  }
  box(c: Col, sx: number, sy: number, sz: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) { return this.geo(unit.box, c, x, y, z, sx, sy, sz, rx, ry, rz); }
  cyl(c: Col, r: number, h: number, x: number, y: number, z: number, seg = 10, rx = 0, ry = 0, rz = 0, taper = 1) { return this.geo(cylG(taper, 1, seg), c, x, y, z, r, h, r, rx, ry, rz); }
  cone(c: Col, r: number, h: number, x: number, y: number, z: number, seg = 10, ry = 0) { return this.geo(cylG(0, 1, seg), c, x, y, z, r, h, r, 0, ry, 0); }
  sph(c: Col, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) { return this.geo(unit.sph, c, x, y, z, r * sx, r * sy, r * sz); }
  blob(c: Col, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, fine = false) { return this.geo(fine ? unit.blob1 : unit.blob, c, x, y, z, r * sx, r * sy, r * sz, 0, ry, 0); }
  half(c: Col, r: number, x: number, y: number, z: number, sy = 1) { return this.geo(unit.half, c, x, y, z, r, r * sy, r); }
  prism(c: Col, sx: number, sy: number, sz: number, x: number, y: number, z: number, ry = 0) { return this.geo(prism(), c, x, y, z, sx, sy, sz, 0, ry, 0); }
}

// Farben
const K = {
  wood: 0x8a5a2e, woodL: 0xb07c48, woodD: 0x5e3d20, stone: 0xa9afb8, stoneD: 0x7d838c, dark: 0x2b2f38, metal: 0x8d95a3,
  white: 0xf6f6f2, red: 0xd9483b, yellow: 0xf2b233, snow: 0xf4f8fc, green: 0x4ea845, greenD: 0x2f7a33, glass: 0x8fc9f0,
  rust: 0xa65a32, sand: 0xe8c088, straw: 0xe0c070, pink: 0xffb0cc,
};

export function buildProps(map: MapData, ctx: PropCtx) {
  const parts = new Map<string, { m: Mat; geos: THREE.BufferGeometry[] }>();
  const CW = WORLD / CHUNKS;
  // einfarbige Teile: Farbe pro Ecke, damit alles eines Kartenbereichs in EIN Mesh passt (wenige Draw-Calls)
  const vcMat = ctx.vcToon;
  const colorOf = new Map<Mat, THREE.Color>();
  const sink = (g: THREE.BufferGeometry, m: Mat, mat: THREE.Matrix4, x: number, z: number) => {
    const ci = Math.max(0, Math.min(CHUNKS - 1, Math.floor(x / CW))) + Math.max(0, Math.min(CHUNKS - 1, Math.floor(z / CW))) * CHUNKS;
    const cc = colorOf.get(m);
    const key = (cc ? 'vc' : m.uuid) + ':' + ci;
    const n = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(mat);
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    if (!n.getAttribute('normal')) n.computeVertexNormals();
    if (cc) {
      const cnt = n.getAttribute('position').count, arr = new Float32Array(cnt * 3);
      for (let i = 0; i < cnt; i++) { arr[i * 3] = cc.r; arr[i * 3 + 1] = cc.g; arr[i * 3 + 2] = cc.b; }
      n.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    const l = parts.get(key) ?? { m: cc ? vcMat : m, geos: [] };
    l.geos.push(n); parts.set(key, l);
  };
  const col = (c: Col) => {
    if (typeof c !== 'number') return c;
    const m = ctx.toon(c);
    if (!colorOf.has(m)) colorOf.set(m, new THREE.Color(c));
    return m;
  };
  const b = new Builder(sink, col);
  const basic = (c: number, opacity = 1, add = false) => {
    const m = new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1 || add, opacity, depthWrite: !(opacity < 1 || add), blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    ctx.dispose.push(m);
    return m;
  };
  const glow = { warm: basic(0xffd27a), red: basic(0xff3b30), lamp: basic(0xfff1c2) };

  /** bewegliche Gruppe: eigener Builder, der Meshes direkt anhängt */
  const group = (x: number, y: number, a = 0, s = 1, h = 0) => {
    const g = new THREE.Group();
    g.position.set(x * S, h, y * S); g.rotation.y = -a; g.scale.setScalar(s);
    ctx.world.add(g);
    const gb = new Builder((geo, m, mat) => {
      const mesh = new THREE.Mesh(geo, m); mesh.applyMatrix4(mat); mesh.castShadow = true; g.add(mesh);
    }, col);
    gb.base.identity();
    return { g, gb };
  };
  /** Teil-Gruppe (z. B. Rotor) innerhalb einer Gruppe */
  const sub = (parent: THREE.Object3D, x: number, y: number, z: number) => {
    const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
    const gb = new Builder((geo, m, mat) => { const mesh = new THREE.Mesh(geo, m); mesh.applyMatrix4(mat); mesh.castShadow = true; g.add(mesh); }, col);
    gb.base.identity();
    return { g, gb };
  };
  const rnd = (() => { let s = 99; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();

  // Rauch / Partikel-Helfer: Kugeln steigen auf, wachsen und verblassen
  const smokeMat = basic(0xe8e8e8, 0.45);
  const smoke = (x: number, y: number, h: number, size: number, rate = 1) => {
    const g = new THREE.Group(); ctx.world.add(g);
    const n = 7;
    const puffs = Array.from({ length: n }, (_, i) => {
      const m = new THREE.Mesh(unit.blob1, smokeMat.clone()); ctx.dispose.push(m.material as Mat);
      g.add(m);
      return { m, t: i / n };
    });
    ctx.anims.push((_, dt) => {
      for (const p of puffs) {
        p.t = (p.t + dt * 0.18 * rate) % 1;
        const k = p.t;
        p.m.position.set(x * S + k * 2.2, h + k * 7, y * S + k * 0.8);
        p.m.scale.setScalar(size * (0.5 + k * 1.6));
        (p.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
      }
    });
  };

  const poles: Prop[] = [];
  for (const p of map.props) {
    const a = p.a ?? 0, s = p.s ?? 1;
    switch (p.k) {
      // ---------- Stadt ----------
      case 'fountain': {
        b.at(p.x, p.y);
        b.cyl(K.stone, 3.5, 0.7, 0, 0.35, 0, 28);
        b.cyl(K.stoneD, 3.62, 0.12, 0, 0.72, 0, 28);
        b.geo(new THREE.CircleGeometry(3.2, 32).rotateX(-Math.PI / 2), ctx.water, 0, 0.62, 0);
        b.cyl(K.stone, 0.45, 1.8, 0, 1.4, 0, 12);
        b.cyl(K.stone, 1.5, 0.35, 0, 2.3, 0, 20, 0, 0, 0, 1.3);
        b.geo(new THREE.CircleGeometry(1.75, 24).rotateX(-Math.PI / 2), ctx.water, 0, 2.46, 0);
        b.cyl(K.stone, 0.25, 0.9, 0, 2.9, 0, 10);
        b.cyl(K.stone, 0.7, 0.22, 0, 3.4, 0, 16, 0, 0, 0, 1.4);
        // Wasserstrahl: Tropfen im Bogen
        const g = new THREE.Group(); g.position.set(p.x * S, 0, p.y * S); ctx.world.add(g);
        const dm = basic(0xbfe9ff, 0.85);
        const drops = Array.from({ length: 18 }, (_, i) => { const m = new THREE.Mesh(unit.sph, dm); m.scale.setScalar(0.12); g.add(m); return { m, t: i / 18, a: (i % 6) / 6 * Math.PI * 2 }; });
        const jet = new THREE.Mesh(cylG(0.08, 0.14, 8, true), dm); jet.scale.set(1, 1.2, 1); jet.position.y = 4.1; g.add(jet);
        ctx.anims.push((_, dt) => {
          for (const d of drops) {
            d.t = (d.t + dt * 0.7) % 1;
            const r0 = d.t * 1.5, hh = 4.6 + d.t * 1.4 - d.t * d.t * 3.4;
            d.m.position.set(Math.cos(d.a) * r0, Math.max(2.5, hh), Math.sin(d.a) * r0);
          }
        });
        break;
      }
      case 'awning': {
        b.at(p.x, p.y, a);
        const cc = p.c ?? K.red;
        for (let i = 0; i < 6; i++) b.box(i % 2 ? K.white : cc, 1.05, 0.07, 0.42, 0.55, 1.95, -1.3 + i * 0.52 + 0.26, 0, 0, -0.32);
        b.box(cc, 0.06, 0.22, 3.15, 1.06, 1.72, 0);
        break;
      }
      case 'cafetable': {
        b.at(p.x, p.y, a);
        b.cyl(K.white, 0.5, 0.06, 0, 0.78, 0, 14); b.cyl(K.dark, 0.05, 0.78, 0, 0.39, 0, 6);
        for (const sx of [-1, 1]) { b.box(K.woodL, 0.42, 0.06, 0.42, sx * 0.85, 0.46, 0); b.box(K.woodL, 0.06, 0.5, 0.42, sx * 1.06, 0.7, 0); for (const lx of [-0.17, 0.17]) for (const lz of [-0.17, 0.17]) b.box(K.dark, 0.04, 0.46, 0.04, sx * 0.85 + lx, 0.23, lz); }
        b.cyl(K.dark, 0.035, 1.6, 0, 1.6, 0, 6);
        b.cone(p.c ?? K.white, 1.25, 0.55, 0, 2.55, 0, 8);
        break;
      }
      case 'mailbox':
        b.at(p.x, p.y, a);
        b.box(K.wood, 0.1, 1.0, 0.1, 0, 0.5, 0);
        b.box(0x3d7fd9, 0.42, 0.3, 0.28, 0, 1.1, 0); b.box(K.red, 0.04, 0.18, 0.04, 0.2, 1.3, 0.1);
        break;
      case 'lamp':
        b.at(p.x, p.y, a);
        b.cyl(K.dark, 0.08, 3.4, 0, 1.7, 0, 6); b.cyl(K.dark, 0.18, 0.2, 0, 0.1, 0, 8);
        b.box(K.dark, 0.36, 0.08, 0.36, 0, 3.45, 0); b.box(glow.lamp, 0.26, 0.34, 0.26, 0, 3.24, 0); b.cone(K.dark, 0.26, 0.22, 0, 3.6, 0, 4, Math.PI / 4);
        break;
      case 'bench':
        b.at(p.x, p.y, a);
        b.box(K.woodL, 1.7, 0.08, 0.5, 0, 0.48, 0); b.box(K.woodL, 1.7, 0.42, 0.07, 0, 0.78, -0.24);
        for (const sx of [-0.7, 0.7]) b.box(K.dark, 0.08, 0.48, 0.5, sx, 0.24, 0);
        break;
      case 'hydrant':
        b.at(p.x, p.y, a);
        b.cyl(K.red, 0.18, 0.7, 0, 0.35, 0, 10); b.sph(K.red, 0.19, 0, 0.72, 0, 1, 0.7, 1); b.cyl(K.yellow, 0.07, 0.42, 0, 0.45, 0, 6, 0, 0, Math.PI / 2);
        break;
      case 'bin':
        b.at(p.x, p.y, a);
        b.cyl(0x3f8f4a, 0.28, 0.8, 0, 0.4, 0, 10); b.cyl(K.dark, 0.3, 0.06, 0, 0.82, 0, 10);
        break;
      case 'planter':
        b.at(p.x, p.y, a);
        b.box(K.woodL, 0.9, 0.5, 0.9, 0, 0.25, 0); b.blob(K.green, 0.55, 0, 0.75, 0, 1, 0.75, 1, 0, true);
        for (let i = 0; i < 3; i++) b.sph(i % 2 ? 0xffe066 : 0xff8fb1, 0.09, -0.25 + i * 0.25, 1.05, 0.2);
        break;
      case 'car': {
        b.at(p.x, p.y, a);
        const cc = p.c ?? K.red;
        b.box(cc, 5.6, 0.9, 2.6, 0, 0.85, 0); b.box(cc, 3.0, 0.75, 2.3, -0.3, 1.65, 0);
        b.box(K.glass, 3.02, 0.55, 2.0, -0.3, 1.66, 0); b.box(K.glass, 0.08, 0.55, 2.0, 1.21, 1.62, 0, 0, 0, -0.35);
        b.box(K.dark, 5.7, 0.25, 2.66, 0, 0.5, 0);
        for (const wx of [-1.75, 1.75]) for (const wz of [-1.22, 1.22]) b.cyl(K.dark, 0.48, 0.4, wx, 0.48, wz, 12, Math.PI / 2);
        for (const wz of [-0.85, 0.85]) { b.box(glow.lamp, 0.06, 0.22, 0.42, 2.82, 0.95, wz); b.box(glow.red, 0.06, 0.2, 0.38, -2.82, 0.95, wz); }
        break;
      }
      case 'pole': poles.push(p); b.at(p.x, p.y, a); b.cyl(K.woodD, 0.13, 6.6, 0, 3.3, 0, 7); b.box(K.woodD, 0.14, 0.14, 2.2, 0, 6.2, 0); for (const z of [-0.9, 0, 0.9]) b.cyl(K.white, 0.07, 0.18, 0, 6.38, z, 6); break;
      case 'lowwall': {
        b.at(p.x, p.y, a);
        for (let i = 0; i < 5; i++) b.box(i % 2 ? K.stone : K.stoneD, 1.75, 1.0 + (i % 3) * 0.12, 1.6, -3.6 + i * 1.8, 0.55, (rnd() - 0.5) * 0.1);
        b.box(0x6fae54, 9, 0.12, 1.5, 0, 1.18, 0);
        break;
      }
      // ---------- Türme ----------
      case 'signaltower': {
        b.at(p.x, p.y, a);
        const H = 20;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(K.red, 0.18, H, 0.18, sx * 1.1, H / 2, sz * 1.1, sz * 0.1, 0, -sx * 0.1);
        for (let y = 2; y < H; y += 2.5) { const w = 2.2 * (1 - y / H * 0.85) + 0.3; b.box(y % 5 < 2.5 ? K.white : K.red, w, 0.1, 0.1, 0, y, w / 2 - 0.05); b.box(K.white, w, 0.1, 0.1, 0, y, -w / 2 + 0.05); b.box(K.red, 0.1, 0.1, w, w / 2 - 0.05, y, 0); b.box(K.red, 0.1, 0.1, w, -w / 2 + 0.05, y, 0); }
        b.half(K.white, 0.9, 0.5, 14, 0.4, 0.35);
        const { g } = group(p.x, p.y, a);
        const light = new THREE.Mesh(unit.sph, basic(0xff3b30)); light.position.y = H + 0.3; light.scale.setScalar(0.28); g.add(light);
        ctx.anims.push((t) => { light.visible = Math.sin(t * 3) > 0; });
        break;
      }
      case 'watertower': {
        b.at(p.x, p.y, a);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(K.metal, 0.22, 7, 0.22, sx * 1.6, 3.5, sz * 1.6);
        for (const y of [2.4, 4.8]) { b.box(K.metal, 3.4, 0.1, 0.1, 0, y, 1.6); b.box(K.metal, 3.4, 0.1, 0.1, 0, y, -1.6); b.box(K.metal, 0.1, 0.1, 3.4, 1.6, y, 0); b.box(K.metal, 0.1, 0.1, 3.4, -1.6, y, 0); }
        b.cyl(0x7fb6e8, 2.5, 2.8, 0, 8.4, 0, 18); b.cyl(K.white, 2.55, 0.25, 0, 8.4, 0, 18);
        b.cone(K.red, 2.75, 1.3, 0, 10.45, 0, 18); b.box(K.dark, 0.1, 7, 0.5, 2.2, 3.5, 0);
        break;
      }
      case 'rangertower': {
        b.at(p.x, p.y, a);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(K.wood, 0.3, 7.5, 0.3, sx * 1.6, 3.75, sz * 1.6);
        for (const y of [2.5, 5]) for (const r of [0, Math.PI / 2]) b.box(K.woodD, 3.6, 0.12, 0.12, 0, y, 0, 0, r, 0.7);
        b.box(K.woodL, 4.2, 0.25, 4.2, 0, 7.5, 0);
        for (const sx of [-1, 1]) { b.box(K.wood, 4.2, 0.9, 0.12, 0, 8.1, sx * 2.05); b.box(K.wood, 0.12, 0.9, 4.2, sx * 2.05, 8.1, 0); }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(K.wood, 0.16, 2.6, 0.16, sx * 1.95, 8.9, sz * 1.95);
        b.cone(0x2f7a55, 3.4, 1.8, 0, 11.1, 0, 4, Math.PI / 4);
        for (let y = 0.5; y < 7.4; y += 0.55) b.box(K.woodD, 0.7, 0.08, 0.1, 0, y, 2.2);
        break;
      }
      case 'windpump': {
        b.at(p.x, p.y, a);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(K.metal, 0.14, 9.4, 0.14, sx * 0.9, 4.7, sz * 0.9, sz * 0.08, 0, -sx * 0.08);
        for (let y = 1.5; y < 9; y += 2) b.box(K.metal, 1.8 - y * 0.15, 0.08, 1.8 - y * 0.15, 0, y, 0);
        const { g } = group(p.x, p.y, a);
        const tail = sub(g, 0, 9.5, 0); tail.gb.box(K.metal, 2.6, 0.08, 0.08, -1.3, 0, 0); tail.gb.box(K.red, 0.06, 1.0, 1.2, -2.6, 0.1, 0);
        const fan = sub(g, 0.4, 9.5, 0);
        // Flügel beginnen außerhalb der Nabe und sind leicht versetzt (kein Flackern durch Überlappung)
        for (let i = 0; i < 12; i++) { const ang = i / 12 * Math.PI * 2; fan.gb.box(i % 3 ? K.white : K.red, 0.04, 1.05, 0.3, (i % 2) * 0.03, Math.cos(ang) * 1.0, Math.sin(ang) * 1.0, ang, 0, 0); }
        fan.gb.cyl(K.dark, 0.42, 0.34, 0.02, 0, 0, 12, 0, 0, Math.PI / 2);
        ctx.anims.push((_, dt) => { fan.g.rotation.x += dt * 2.2; g.rotation.y = -a + Math.sin(performance.now() * 0.0003) * 0.3; });
        break;
      }
      case 'lighthouse': {
        b.at(p.x, p.y);
        for (let i = 0; i < 6; i++) b.cyl(i % 2 ? K.red : K.white, 2.3 - i * 0.12, 2.4, 0, 1.2 + i * 2.4, 0, 18, 0, 0, 0, (2.3 - (i + 1) * 0.12) / (2.3 - i * 0.12));
        b.cyl(K.dark, 2.1, 0.25, 0, 14.5, 0, 18);
        for (let i = 0; i < 12; i++) { const ang = i / 12 * Math.PI * 2; b.box(K.dark, 0.08, 0.8, 0.08, Math.cos(ang) * 2, 15, Math.sin(ang) * 2); }
        b.cyl(glow.warm, 1.1, 1.6, 0, 15.5, 0, 12); b.cone(K.red, 1.5, 1.4, 0, 17, 0, 12); b.sph(K.dark, 0.25, 0, 17.8, 0);
        b.box(K.white, 1.2, 1.8, 0.2, 0, 0.9, 2.25);
        const { g } = group(p.x, p.y);
        const beamM = basic(0xfff3b0, 0.18, true);
        const beam = new THREE.Group(); beam.position.y = 15.5; g.add(beam);
        for (const sd of [1, -1]) { const c = new THREE.Mesh(cylG(0.4, 3.5, 12, true), beamM); c.rotation.z = sd * Math.PI / 2; c.position.x = sd * 14; c.scale.set(1, 28, 1); beam.add(c); }
        ctx.anims.push((_, dt) => { beam.rotation.y += dt * 0.8; });
        break;
      }
      // ---------- Schnee ----------
      case 'dome': {
        b.at(p.x, p.y, a, s);
        b.cyl(0xd5dde6, 4.1, 0.6, 0, 0.3, 0, 22); b.half(0xeef3f8, 4, 0, 0.6, 0, 0.85);
        b.box(0xd5dde6, 2.2, 2.2, 2.6, 0, 1.1, 4.3); b.box(K.dark, 1.2, 1.6, 0.1, 0, 0.8, 5.62);
        b.cyl(K.metal, 0.08, 2.4, 1.6, 4.4, 0, 6); b.sph(K.red, 0.15, 1.6, 5.6, 0);
        for (let i = 0; i < 6; i++) { const ang = i / 6 * Math.PI; b.box(0xc9d2dc, 0.12, 0.12, 8.1, 0, 0.6, 0, 0, ang, 0); }
        break;
      }
      case 'antenna': {
        b.at(p.x, p.y, a);
        b.box(K.metal, 1.2, 0.5, 1.2, 0, 0.25, 0); b.cyl(K.metal, 0.12, 13, 0, 6.5, 0, 6);
        for (let y = 3; y < 13; y += 3) b.box(K.metal, 1.2 - y * 0.06, 0.06, 0.06, 0, y, 0);
        b.half(K.white, 1.4, 0, 9, 0.5, 0.35); b.sph(K.red, 0.2, 0, 13.1, 0);
        break;
      }
      case 'snowmobile': {
        b.at(p.x, p.y, a);
        const cc = p.c ?? K.red;
        b.box(cc, 2.6, 0.7, 1.1, 0, 0.75, 0); b.box(cc, 0.9, 0.5, 1.0, 1.4, 0.6, 0, 0, 0, 0.4);
        b.box(K.dark, 1.3, 0.3, 0.8, -0.4, 1.2, 0); b.box(K.glass, 0.08, 0.5, 0.9, 0.85, 1.3, 0, 0, 0, -0.5);
        for (const sz of [-0.55, 0.55]) b.box(K.metal, 2.4, 0.08, 0.16, 0.6, 0.15, sz);
        b.box(K.dark, 1.8, 0.4, 0.8, -0.5, 0.3, 0);
        break;
      }
      case 'snowman':
        b.at(p.x, p.y, a);
        b.sph(K.snow, 0.75, 0, 0.7, 0); b.sph(K.snow, 0.55, 0, 1.7, 0); b.sph(K.snow, 0.4, 0, 2.45, 0);
        b.cone(0xff8a2e, 0.08, 0.4, 0.42, 2.45, 0, 6); b.geo(cylG(0, 1, 6), 0xff8a2e, 0.5, 2.45, 0, 0.08, 0.4, 0.08, 0, 0, -Math.PI / 2);
        for (const z of [-0.14, 0.14]) b.sph(K.dark, 0.05, 0.36, 2.58, z);
        b.cyl(K.dark, 0.32, 0.5, 0, 2.95, 0, 10); b.cyl(K.dark, 0.48, 0.05, 0, 2.72, 0, 12); b.box(K.red, 0.12, 0.12, 0.9, 0, 2.08, 0);
        break;
      case 'woodpile':
        b.at(p.x, p.y, a);
        for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) b.cyl(i % 2 ? K.wood : K.woodL, 0.3, 1.8, -0.9 + i * 0.62 + row * 0.31, 0.3 + row * 0.52, 0, 8, Math.PI / 2);
        b.box(K.snow, 2.2, 0.12, 1.7, 0, 1.62, 0);
        break;
      // ---------- Wüste ----------
      case 'mesa': {
        b.at(p.x, p.y, a, s);
        b.cyl(0xc8673e, 7.8, 3.2, 0, 1.6, 0, 7, 0, 0, 0, 0.86);
        b.cyl(0xd9814f, 6.6, 1.1, 0.4, 3.7, 0.2, 7, 0, 0.3, 0, 0.9);
        b.cyl(0xb5582f, 5.8, 2.0, 0.6, 5.2, 0.3, 7, 0, 0.6, 0, 0.88);
        b.cyl(0xe39a62, 5.0, 0.3, 0.7, 6.35, 0.3, 7, 0, 0.6, 0);
        break;
      }
      case 'tank': {
        b.at(p.x, p.y, a);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(K.woodD, 0.3, 4.4, 0.3, sx * 1.5, 2.2, sz * 1.5);
        b.box(K.woodD, 3.6, 0.3, 3.6, 0, 4.4, 0);
        b.cyl(K.wood, 2.1, 2.6, 0, 5.85, 0, 16); for (const y of [4.9, 5.85, 6.8]) b.cyl(K.dark, 2.14, 0.1, 0, y, 0, 16);
        b.cone(K.woodD, 2.4, 1.0, 0, 7.65, 0, 16);
        break;
      }
      case 'wagon': {
        b.at(p.x, p.y, a);
        b.box(K.wood, 4.6, 0.8, 2.2, 0, 1.2, 0);
        b.geo(new THREE.CylinderGeometry(1.25, 1.25, 4, 14, 1, false, -Math.PI / 2, Math.PI), 0xf3ead8, 0, 1.6, 0, 1, 1, 1, 0, 0, Math.PI / 2);
        for (const wx of [-1.6, 1.6]) for (const wz of [-1.2, 1.2]) { b.cyl(K.woodD, 0.75, 0.12, wx, 0.75, wz, 12, Math.PI / 2); b.cyl(K.wood, 0.2, 0.18, wx, 0.75, wz, 8, Math.PI / 2); }
        b.box(K.woodD, 1.8, 0.1, 0.1, 3.1, 0.9, 0);
        break;
      }
      case 'skull':
        b.at(p.x, p.y, a);
        b.sph(0xf2ead8, 0.28, 0, 0.18, 0, 1.3, 0.7, 1); b.sph(0xf2ead8, 0.2, 0.32, 0.12, 0, 1.2, 0.6, 0.9);
        for (const sz of [-1, 1]) b.geo(cylG(0, 1, 6), 0xf2ead8, -0.1, 0.22, sz * 0.45, 0.07, 0.6, 0.07, sz * 1.2, 0, 0.3);
        break;
      case 'drybush':
        b.at(p.x, p.y, a, s);
        b.blob(0x9c8a52, 0.6, 0, 0.45, 0, 1, 0.7, 1); b.blob(0x8a7742, 0.4, 0.35, 0.35, 0.2, 1, 0.8, 1);
        break;
      case 'dustdevil': {
        const { g } = group(p.x, p.y);
        const m = basic(0xe8cfa0, 0.22);
        const cone = new THREE.Mesh(cylG(1.8, 0.25, 12, true), m); cone.scale.set(1, 6, 1); cone.position.y = 3; g.add(cone);
        const cone2 = new THREE.Mesh(cylG(1.2, 0.15, 10, true), m); cone2.scale.set(1, 4, 1); cone2.position.y = 2; g.add(cone2);
        const bits = Array.from({ length: 10 }, (_, i) => { const mm = new THREE.Mesh(unit.blob, basic(0xc9a46a, 0.6)); mm.scale.setScalar(0.12); g.add(mm); return { mm, ph: i / 10 }; });
        const cx = p.x * S, cz = p.y * S, ph = a;
        ctx.anims.push((t) => {
          g.position.set(cx + Math.cos(t * 0.13 + ph) * 9, 0, cz + Math.sin(t * 0.17 + ph) * 9);
          cone.rotation.y = t * 6; cone2.rotation.y = -t * 8;
          for (const q of bits) { const k = (t * 0.4 + q.ph) % 1, ang = t * 5 + q.ph * 20; q.mm.position.set(Math.cos(ang) * (0.3 + k * 1.6), k * 5.5, Math.sin(ang) * (0.3 + k * 1.6)); }
          const vis = 0.7 + Math.sin(t * 0.21 + ph * 3) * 0.3; g.scale.setScalar(vis);
        });
        break;
      }
      case 'quarrypit': {
        b.at(p.x, p.y);
        const R = s * S;
        for (const [k, c] of [[1, 0xc7a27a], [0.78, 0xb48c64], [0.56, 0xa07a54], [0.34, 0x8c6a48]] as const) b.geo(new THREE.CircleGeometry(R * k, 9).rotateX(-Math.PI / 2), c, 0, 0.013 + (1 - k) * 0.004, 0, 1, 1, 1, 0, 0.3 * k, 0);
        break;
      }
      case 'excavator': {
        b.at(p.x, p.y, a);
        for (const sz of [-1.3, 1.3]) b.box(K.dark, 4.6, 0.9, 0.9, 0, 0.45, sz);
        b.box(K.yellow, 3.6, 1.3, 2.6, -0.3, 1.6, 0); b.box(K.yellow, 1.5, 1.6, 1.3, 0.8, 3.0, -0.55); b.box(K.glass, 1.3, 1.0, 0.08, 0.8, 3.1, -1.22);
        b.box(K.yellow, 3.4, 0.45, 0.45, 2.6, 3.1, 0.6, 0, 0, 0.55); b.box(K.yellow, 2.6, 0.4, 0.4, 4.6, 2.7, 0.6, 0, 0, -0.9); b.box(K.dark, 1.1, 0.8, 1.2, 5.1, 1.4, 0.6);
        b.box(K.dark, 1.2, 0.6, 2.4, -2.3, 1.7, 0);
        break;
      }
      case 'conveyor': {
        b.at(p.x, p.y, a);
        b.box(K.metal, 15, 0.35, 1.3, 0, 1.9, 0, 0, 0, 0.18); b.box(K.dark, 15, 0.1, 1.0, 0, 2.1, 0, 0, 0, 0.18);
        for (const x of [-5, 0, 5]) { const h = 1.9 + x * 0.18; for (const sz of [-0.55, 0.55]) b.box(K.metal, 0.15, h, 0.15, x, h / 2, sz); }
        for (let i = 0; i < 6; i++) b.blob(0x9a8a78, 0.28, -5 + i * 2, 2.35 + (-5 + i * 2) * 0.18, 0);
        b.blob(0x9a8a78, 1.4, 8.2, 0.7, 0, 1.2, 0.6, 1);
        break;
      }
      case 'minecart': {
        b.at(p.x, p.y, a);
        for (const sz of [-0.55, 0.55]) b.box(K.metal, 4.5, 0.08, 0.08, 0, 0.06, sz);
        for (let i = 0; i < 6; i++) b.box(K.woodD, 0.25, 0.05, 1.5, -2 + i * 0.8, 0.03, 0);
        b.box(K.rust, 1.7, 1.0, 1.2, 0, 0.85, 0); b.box(0x7d838c, 1.5, 0.3, 1.0, 0, 1.3, 0);
        for (const sx of [-0.55, 0.55]) for (const sz of [-0.55, 0.55]) b.cyl(K.dark, 0.26, 0.1, sx, 0.28, sz, 10, Math.PI / 2);
        break;
      }
      // ---------- Kirschblüten ----------
      case 'pagoda': {
        b.at(p.x, p.y, a);
        b.box(K.stoneD, 8.6, 0.5, 8.6, 0, 0.25, 0);
        const tiers = 4;
        for (let i = 0; i < tiers; i++) {
          const w = 6.4 - i * 1.2, y0 = 0.5 + i * 3.0;
          b.box(0xc23b2b, w, 2.2, w, 0, y0 + 1.1, 0);
          b.box(0xf6ead2, w + 0.05, 0.6, w + 0.05, 0, y0 + 1.6, 0);
          b.cone(0x3a3f4a, (w + 3) * 0.72, 1.2, 0, y0 + 2.75, 0, 4, Math.PI / 4);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cone(0x3a3f4a, 0.25, 0.7, sx * (w / 2 + 1.25), y0 + 2.45, sz * (w / 2 + 1.25), 4);
        }
        b.cyl(0xffc93c, 0.12, 3, 0, 0.5 + tiers * 3 + 1.4, 0, 6); for (let i = 0; i < 4; i++) b.cyl(0xffc93c, 0.3 - i * 0.05, 0.12, 0, 0.5 + tiers * 3 + 0.6 + i * 0.5, 0, 8);
        b.box(K.dark, 1.4, 1.8, 0.1, 0, 1.4, 3.22);
        break;
      }
      case 'torii': {
        b.at(p.x, p.y, a + Math.PI / 2);
        for (const sx of [-1, 1]) { b.cyl(0xd23a2a, 0.3, 4.6, sx * 4.6, 2.3, 0, 10); b.cyl(K.dark, 0.36, 0.4, sx * 4.6, 0.2, 0, 10); }
        b.box(0xd23a2a, 11.4, 0.45, 0.6, 0, 4.7, 0); b.box(K.dark, 11.8, 0.25, 0.7, 0, 5.0, 0);
        b.box(0xd23a2a, 10.0, 0.3, 0.4, 0, 3.7, 0); b.box(0xd23a2a, 0.3, 1.0, 0.35, 0, 4.2, 0);
        break;
      }
      case 'stonelantern':
        b.at(p.x, p.y, a);
        b.box(K.stone, 0.7, 0.2, 0.7, 0, 0.1, 0); b.cyl(K.stone, 0.16, 1.0, 0, 0.7, 0, 8);
        b.box(K.stone, 0.62, 0.12, 0.62, 0, 1.25, 0); b.box(glow.warm, 0.42, 0.42, 0.42, 0, 1.52, 0);
        b.cone(K.stoneD, 0.6, 0.45, 0, 1.97, 0, 4, Math.PI / 4); b.sph(K.stoneD, 0.08, 0, 2.25, 0);
        break;
      case 'koibridge': {
        b.at(p.x, p.y, 0.6);
        const L = (s + 60) * S, n = 14, H = 1.6;
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n, x0 = -L + t0 * 2 * L, x1 = -L + t1 * 2 * L;
          const y0 = Math.sin(t0 * Math.PI) * H, y1 = Math.sin(t1 * Math.PI) * H, len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
          b.box(0xd23a2a, len + 0.05, 0.18, 2.6, (x0 + x1) / 2, (y0 + y1) / 2 + 0.1, 0, 0, 0, ang);
          for (const sz of [-1.25, 1.25]) b.box(0xd23a2a, len + 0.05, 0.12, 0.12, (x0 + x1) / 2, (y0 + y1) / 2 + 1.0, sz, 0, 0, ang);
          if (i % 2 === 0) for (const sz of [-1.25, 1.25]) b.box(0xd23a2a, 0.12, 0.9, 0.12, x0, y0 + 0.55, sz);
        }
        // Kois schwimmen im Kreis
        const { g } = group(p.x, p.y);
        const fishes = Array.from({ length: 6 }, (_, i) => {
          const f = new THREE.Group();
          const bm = new THREE.Mesh(unit.sph, ctx.toon(i % 2 ? 0xff7a2e : 0xf6f6f2)); bm.scale.set(0.45, 0.12, 0.2); f.add(bm);
          const tl = new THREE.Mesh(unit.box, ctx.toon(0xff7a2e)); tl.scale.set(0.25, 0.04, 0.25); tl.position.x = -0.5; tl.rotation.y = Math.PI / 4; f.add(tl);
          f.position.y = 0.0; g.add(f);
          return { f, r: (s * S) * (0.3 + (i % 3) * 0.2), ph: i * 1.1, sp: 0.25 + (i % 3) * 0.08 };
        });
        ctx.anims.push((t) => { for (const q of fishes) { const ang = t * q.sp + q.ph; q.f.position.set(Math.cos(ang) * q.r, 0.02, Math.sin(ang) * q.r); q.f.rotation.y = -ang - Math.PI / 2; } });
        break;
      }
      case 'bamboo': {
        b.at(p.x, p.y, rnd() * 6, s);
        for (let i = 0; i < 3; i++) {
          const ox = (i - 1) * 0.35, oz = (i % 2) * 0.3 - 0.15, h = 6 + i * 1.2;
          b.cyl(i % 2 ? 0x7cbf4a : 0x8fcf5a, 0.12, h, ox, h / 2, oz, 6);
          for (let y = 1.2; y < h; y += 1.2) b.cyl(0x5f9a38, 0.14, 0.08, ox, y, oz, 6);
          b.blob(0x6fbf4a, 0.7, ox, h + 0.2, oz, 1.2, 0.5, 1.2);
        }
        break;
      }
      case 'zen': {
        b.at(p.x, p.y, a);
        b.box(0xe7e2d6, 13, 0.06, 9, 0, 0.03, 0);
        for (let z = -4; z <= 4; z += 0.6) b.box(0xcfc8b8, 12.6, 0.07, 0.08, 0, 0.04, z);
        for (const sx of [-1, 1]) { b.box(K.woodD, 13.4, 0.25, 0.2, 0, 0.12, sx * 4.6); b.box(K.woodD, 0.2, 0.25, 9.4, sx * 6.6, 0.12, 0); }
        b.blob(K.stoneD, 1.1, -3, 0.6, -1, 1, 0.8, 1); b.blob(K.stone, 0.7, 3.5, 0.4, 1.5); b.blob(K.stone, 0.5, 1.5, 0.3, -2.2);
        for (const [x, z] of [[-3, -1], [3.5, 1.5]]) b.geo(new THREE.RingGeometry(1.5, 1.6, 24).rotateX(-Math.PI / 2), 0xcfc8b8, x, 0.07, z);
        break;
      }
      // ---------- Industrie ----------
      case 'chimney': {
        b.at(p.x, p.y, a);
        b.box(K.stoneD, 3.6, 1.0, 3.6, 0, 0.5, 0);
        for (let i = 0; i < 8; i++) b.cyl(i >= 6 ? (i % 2 ? K.white : K.red) : 0xb4593c, 1.5 - i * 0.07, 2.2, 0, 1 + 1.1 + i * 2.2, 0, 14, 0, 0, 0, (1.5 - (i + 1) * 0.07) / (1.5 - i * 0.07));
        b.cyl(K.dark, 1.0, 0.3, 0, 18.7, 0, 14);
        smoke(p.x, p.y, 19, 1.4, 0.8);
        break;
      }
      case 'silo':
      case 'silo_farm': {
        b.at(p.x, p.y, a);
        const cc = p.k === 'silo_farm' ? 0xe8ecef : (p.c ?? 0xd8dde3);
        b.cyl(cc, 2.4, 9, 0, 4.5, 0, 18); b.half(p.k === 'silo_farm' ? K.red : 0xb9c1ca, 2.42, 0, 9, 0, 0.6);
        for (const y of [2.5, 5, 7.5]) b.cyl(0xb9c1ca, 2.45, 0.12, 0, y, 0, 18);
        b.box(K.dark, 0.1, 9, 0.5, 2.45, 4.5, 0);
        break;
      }
      case 'container': {
        const lv = p.h ?? 1;
        b.at(p.x, p.y, a);
        for (let l = 0; l < lv; l++) {
          const cc = l === 0 ? (p.c ?? K.red) : [0x3d8cf0, 0x43c463, 0xf2b233, 0xe2574c][(Math.floor(p.x) + l) % 4];
          const y0 = l * 2.75;
          b.box(cc, 7.8, 2.6, 3.0, 0, y0 + 1.3, 0);
          const dk = new THREE.Color(cc).multiplyScalar(0.78).getHex();
          for (let i = -3.4; i <= 3.4; i += 0.5) for (const sz of [-1.53, 1.53]) b.box(dk, 0.18, 2.3, 0.08, i, y0 + 1.3, sz);
          for (const sx of [-3.93, 3.93]) { b.box(dk, 0.08, 2.5, 2.9, sx, y0 + 1.3, 0); for (const z of [-0.5, 0.5]) b.box(K.metal, 0.1, 2.2, 0.06, sx * 1.01, y0 + 1.3, z); }
          b.box(dk, 7.9, 0.12, 3.05, 0, y0 + 2.6, 0);
        }
        break;
      }
      case 'crane': {
        b.at(p.x, p.y, 0);
        const H = 13, LX = 20, LZ = 13.5;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(K.yellow, 0.7, H, 0.7, sx * LX, H / 2, sz * LZ);
        for (const sx of [-1, 1]) b.box(K.yellow, 0.9, 1.0, LZ * 2 + 0.8, sx * LX, H, 0);
        for (const sz of [-1, 1]) b.box(K.yellow, LX * 2 + 0.8, 1.2, 0.9, 0, H + 1, sz * LZ * 0.4);
        const { g } = group(p.x, p.y);
        const trolley = sub(g, 0, H + 0.2, 0);
        trolley.gb.box(K.dark, 1.6, 0.8, LZ * 0.9, 0, 0, 0); trolley.gb.box(K.dark, 0.05, 5, 0.05, 0, -2.9, 0); trolley.gb.box(K.red, 0.8, 0.5, 0.8, 0, -5.5, 0);
        ctx.anims.push((t) => { trolley.g.position.x = Math.sin(t * 0.15) * (LX - 3); });
        break;
      }
      case 'pallet':
        b.at(p.x, p.y, a);
        b.box(K.woodL, 1.8, 0.25, 1.4, 0, 0.13, 0); b.box(0xc89a62, 1.6, 0.9, 1.2, 0, 0.7, 0); b.box(0xb5864f, 0.8, 0.6, 0.6, 0.3, 1.45, 0.1);
        break;
      case 'drum':
        b.at(p.x, p.y, a);
        for (const sz of [-0.6, 0.6]) b.cyl(K.woodL, 1.2, 0.12, 0, 1.2, sz, 16, Math.PI / 2);
        b.cyl(0x3a3d45, 0.75, 1.1, 0, 1.2, 0, 14, Math.PI / 2);
        break;
      case 'forklift':
        b.at(p.x, p.y, a);
        b.box(0xff8a2e, 2.2, 1.0, 1.5, 0, 0.8, 0); b.box(K.dark, 1.0, 0.8, 1.4, -0.6, 1.6, 0);
        for (const sx of [-0.5, 0.9]) for (const sz of [-0.7, 0.7]) b.cyl(K.dark, 0.35, 0.3, sx, 0.35, sz, 10, Math.PI / 2);
        for (const sz of [-0.55, 0.55]) b.box(K.dark, 0.1, 3.2, 0.1, 1.15, 1.6, sz);
        for (const sz of [-0.4, 0.4]) b.box(K.metal, 1.3, 0.06, 0.16, 1.85, 0.2, sz);
        for (const sx of [-0.1, 0.5]) for (const sz of [-0.6, 0.6]) b.box(K.dark, 0.06, 1.2, 0.06, sx, 2.4, sz);
        b.box(K.dark, 0.8, 0.06, 1.3, 0.2, 3.0, 0);
        break;
      case 'barrier':
        b.at(p.x, p.y, a);
        for (let i = 0; i < 4; i++) b.box(i % 2 ? K.white : K.red, 0.6, 0.85, 0.5, -0.9 + i * 0.6, 0.43, 0);
        b.box(K.dark, 2.5, 0.08, 0.6, 0, 0.04, 0);
        break;
      case 'oil': b.at(p.x, p.y, a, s); b.geo(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), basic(0x2a2a30, 0.45), 0, 0.034, 0, 1.4, 1, 0.9); break;
      case 'yline': b.at(p.x, p.y, a); for (const z of [-1.2, 1.2]) b.box(0xf2c230, 14, 0.01, 0.3, 0, 0.033, z); break;
      // ---------- Hafen und Strand ----------
      case 'pier':
        for (const pr of PIERS) {
          const ang = Math.atan2(pr.y2 - pr.y1, pr.x2 - pr.x1), L = Math.hypot(pr.x2 - pr.x1, pr.y2 - pr.y1);
          b.at((pr.x1 + pr.x2) / 2, (pr.y1 + pr.y2) / 2, ang);
          const len = L * S, w = pr.w * S;
          for (let t = -len / 2; t < len / 2; t += 0.62) b.box(t % 1.24 < 0.62 ? K.woodL : 0xa6713f, 0.56, 0.18, w, t + 0.28, 0.12, 0);
          for (let t = -len / 2; t <= len / 2; t += 3) for (const sz of [-w / 2, w / 2]) { b.cyl(K.woodD, 0.22, 2.6, t, -0.9, sz, 8); b.cyl(K.woodD, 0.18, 1.0, t, 0.6, sz, 8); }
          for (const sz of [-w / 2, w / 2]) b.box(K.woodD, len, 0.12, 0.12, 0, 1.05, sz);
        }
        break;
      case 'boat': {
        const { g, gb } = group(p.x, p.y, a);
        const cc = p.c ?? K.white;
        gb.box(cc, 5.2, 1.0, 2.0, 0, 0.1, 0); gb.geo(prism(), cc, 2.6, -0.4, 0, 1.0, 1.0, 2.0, 0, 0, -Math.PI / 2);
        gb.box(K.white, 5.0, 0.2, 1.8, 0, 0.65, 0); gb.box(K.woodL, 4.6, 0.06, 1.6, 0, 0.66, 0);
        gb.box(K.white, 1.6, 1.1, 1.4, -0.8, 1.2, 0); gb.box(K.glass, 1.62, 0.4, 1.2, -0.8, 1.4, 0); gb.box(K.red, 1.8, 0.12, 1.6, -0.8, 1.8, 0);
        const by = -0.35, ph = p.x * 0.01;
        ctx.anims.push((t) => { g.position.y = by + Math.sin(t * 1.2 + ph) * 0.08; g.rotation.z = Math.sin(t * 0.9 + ph) * 0.04; });
        break;
      }
      case 'fishhut':
        b.at(p.x, p.y, a);
        b.box(0x9fb8c8, 5.4, 2.6, 4.6, 0, 1.3, 0); b.prism(0x3a6e8f, 5.8, 1.8, 5.2, 0, 2.6, 0);
        b.box(0x3d7fd9, 1.0, 1.8, 0.08, 0, 0.9, 2.32); b.box(K.white, 1.2, 0.8, 0.08, 1.6, 1.5, 2.32);
        b.box(0x6a5a40, 0.08, 1.6, 2.2, 2.75, 1.4, 0);
        break;
      case 'crates':
        b.at(p.x, p.y, a);
        b.box(K.woodL, 1.4, 1.4, 1.4, 0, 0.7, 0); b.box(K.woodL, 1.2, 1.2, 1.2, 1.3, 0.6, 0.2, 0, 0.4, 0); b.box(0xc89a62, 1.1, 1.1, 1.1, 0.2, 1.95, 0.1, 0, 0.3, 0);
        break;
      case 'nets':
        b.at(p.x, p.y, a);
        b.blob(0x6a5a40, 1.0, 0, 0.25, 0, 1.4, 0.3, 1); for (let i = 0; i < 4; i++) b.sph(0xff8a2e, 0.18, Math.cos(i * 1.6) * 0.9, 0.35, Math.sin(i * 1.6) * 0.7);
        break;
      case 'beachbar':
        b.at(p.x, p.y, a);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(K.woodD, 0.16, 3.2, sx * 3.5, 1.6, sz * 2.4, 6);
        b.cone(K.straw, 5.6, 2.0, 0, 4.2, 0, 4, Math.PI / 4);
        b.box(K.woodL, 6.2, 1.2, 1.0, 0, 0.6, 1.8); b.box(K.wood, 6.4, 0.12, 1.2, 0, 1.25, 1.8);
        for (let i = -2; i <= 2; i += 2) { b.cyl(K.dark, 0.06, 0.8, i, 0.4, 3.0, 6); b.cyl(K.red, 0.3, 0.1, i, 0.85, 3.0, 10); }
        b.box(0x3dc6c6, 2.4, 0.6, 0.1, 0, 3.0, 2.55);
        break;
      case 'umbrella':
        b.at(p.x, p.y, a);
        b.cyl(K.white, 0.05, 2.6, 0, 1.3, 0, 6, 0.15);
        b.cone(p.c ?? K.red, 1.7, 0.6, 0.2, 2.75, 0, 8); b.cone(K.white, 0.6, 0.22, 0.2, 3.0, 0, 8);
        break;
      case 'lounger':
        b.at(p.x, p.y, a);
        b.box(K.white, 2.0, 0.12, 0.8, 0, 0.35, 0); b.box(0x7fc8ff, 1.9, 0.08, 0.7, 0, 0.43, 0); b.box(0x7fc8ff, 0.9, 0.08, 0.7, -1.2, 0.75, 0, 0, 0, 0.6);
        for (const sx of [-0.8, 0.8]) for (const sz of [-0.32, 0.32]) b.box(K.white, 0.06, 0.35, 0.06, sx, 0.17, sz);
        break;
      case 'shell': b.at(p.x, p.y, a); b.half(0xffc9b8, 0.25, 0, 0, 0, 0.5); break;
      case 'driftwood': b.at(p.x, p.y, a); b.cyl(0xa89a86, 0.16, 2.2, 0, 0.15, 0, 7, 0, 0, Math.PI / 2); b.cyl(0xa89a86, 0.1, 0.8, 0.6, 0.2, 0.3, 6, 0, 0.7, Math.PI / 2); break;
      case 'cliffrock':
        b.at(p.x, p.y, a, s);
        b.blob(0x8d8578, 3.6, 0, 1.6, 0, 1, 0.9, 1, 0, true); b.blob(0x9c958a, 2.4, 2.0, 1.0, 1.2, 1, 0.9, 1, 0.5, true); b.blob(0x7d766b, 2.0, -1.8, 0.8, -1.0, 1, 1, 1, 1, true);
        break;
      case 'gulls': {
        const { g } = group(p.x, p.y, 0, s);
        const birds = Array.from({ length: 4 }, (_, i) => {
          const bird = new THREE.Group();
          const body = new THREE.Mesh(unit.sph, ctx.toon(K.white)); body.scale.set(0.35, 0.12, 0.12); bird.add(body);
          const wings = [-1, 1].map((sd) => { const w = new THREE.Mesh(unit.box, ctx.toon(0xdfe5ea)); w.scale.set(0.3, 0.03, 0.8); w.position.z = sd * 0.4; bird.add(w); return { w, sd }; });
          g.add(bird);
          return { bird, wings, r: 8 + i * 2.5, h: 9 + i * 1.3, ph: i * 1.7, sp: 0.35 + i * 0.05 };
        });
        ctx.anims.push((t) => {
          for (const q of birds) {
            const ang = t * q.sp + q.ph;
            q.bird.position.set(Math.cos(ang) * q.r, q.h + Math.sin(t * 0.7 + q.ph) * 0.6, Math.sin(ang) * q.r);
            q.bird.rotation.y = -ang - Math.PI / 2;
            for (const w of q.wings) w.w.rotation.x = w.sd * Math.sin(t * 6 + q.ph) * 0.5;
          }
        });
        break;
      }
      // ---------- Farm ----------
      case 'windmill': {
        b.at(p.x, p.y, a);
        b.cyl(K.white, 2.6, 9, 0, 4.5, 0, 12, 0, 0, 0, 0.62); b.cone(0x3a3f4a, 2.0, 2.0, 0, 10, 0, 12);
        b.box(K.woodD, 1.0, 1.6, 0.1, 0, 0.8, 2.55); b.box(K.glass, 0.6, 0.6, 0.1, 0, 5, 2.0);
        const { g } = group(p.x, p.y, a);
        const rot = sub(g, 0, 8.6, 2.1);
        for (let i = 0; i < 4; i++) { const ang = i * Math.PI / 2; rot.gb.box(K.woodD, 0.2, 6.5, 0.15, Math.sin(ang) * 3.3, Math.cos(ang) * 3.3, 0, 0, 0, -ang); rot.gb.box(0xf3ead8, 1.1, 5.0, 0.06, Math.sin(ang) * 3.6 + Math.cos(ang) * 0.6, Math.cos(ang) * 3.6 - Math.sin(ang) * 0.6, 0.05, 0, 0, -ang); }
        rot.gb.cyl(K.dark, 0.3, 0.5, 0, 0, 0, 8, Math.PI / 2);
        ctx.anims.push((_, dt) => { rot.g.rotation.z -= dt * 0.6; });
        break;
      }
      case 'roundbale':
        b.at(p.x, p.y, a);
        b.cyl(K.straw, 1.1, 1.6, 0, 1.1, 0, 14, Math.PI / 2);
        for (const sz of [-0.81, 0.81]) b.cyl(0xcfae52, 0.95, 0.04, 0, 1.1, sz, 14, Math.PI / 2);
        break;
      // ---------- Wald ----------
      case 'waterfall': {
        b.at(p.x, p.y, a);
        // Felswand quer zum Fluss, Wasser fällt von oben in den Fluss
        b.blob(0x8d8578, 6.5, -4.5, 2.6, 0, 0.9, 1.0, 2.0, 0, true);
        b.blob(0x7d766b, 4.0, -5.5, 5.2, 3, 1, 0.8, 1, 1, true); b.blob(0x9c958a, 3.6, -5.0, 4.8, -3.5, 1, 0.8, 1, 2, true);
        const fallM = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, side: THREE.DoubleSide,
          uniforms: { uT: { value: 0 } },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `uniform float uT; varying vec2 vUv; void main(){
            float s = sin(vUv.x * 40.0 + sin(vUv.x * 7.0) * 2.0) * 0.5 + 0.5;
            float flow = fract(vUv.y * 3.0 + uT * 1.6 + s * 0.3);
            vec3 c = mix(vec3(0.55, 0.85, 0.95), vec3(1.0), smoothstep(0.6, 1.0, flow) * 0.7 + (1.0 - vUv.y) * 0.3);
            float a = 0.88 * smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
            gl_FragColor = vec4(c, a); }`,
        });
        ctx.dispose.push(fallM);
        const { g } = group(p.x, p.y, a);
        const sheet = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.2), fallM); sheet.position.set(-1.6, 2.6, 0); sheet.rotation.set(0, Math.PI / 2, 0.25); g.add(sheet);
        const foamM = basic(0xffffff, 0.75);
        const foams = Array.from({ length: 8 }, (_, i) => { const m = new THREE.Mesh(unit.blob1, foamM); m.position.set(-0.6 + (i % 2) * 0.8, 0.2, -3.6 + i * 1.05); g.add(m); return m; });
        const mistM = basic(0xffffff, 0.25);
        const mist = Array.from({ length: 6 }, (_, i) => { const m = new THREE.Mesh(unit.blob1, mistM); g.add(m); return { m, t: i / 6, z: -3 + i * 1.2 }; });
        ctx.anims.push((t, dt) => {
          fallM.uniforms.uT.value = t;
          foams.forEach((m, i) => m.scale.setScalar(0.55 + Math.sin(t * 5 + i) * 0.15));
          for (const q of mist) { q.t = (q.t + dt * 0.3) % 1; q.m.position.set(0.2 + q.t * 2.5, 0.4 + q.t * 2.2, q.z); q.m.scale.setScalar(0.6 + q.t * 1.4); }
        });
        break;
      }
      case 'campfire': {
        b.at(p.x, p.y);
        for (let i = 0; i < 9; i++) { const ang = i / 9 * Math.PI * 2; b.blob(K.stoneD, 0.32, Math.cos(ang) * 1.0, 0.18, Math.sin(ang) * 1.0); }
        for (let i = 0; i < 3; i++) b.cyl(K.woodD, 0.13, 1.6, 0, 0.25, 0, 6, Math.PI / 2, i * 1.05, 0);
        for (let i = 0; i < 4; i++) { const ang = i / 4 * Math.PI * 2 + 0.4; b.cyl(K.wood, 0.25, 0.9, Math.cos(ang) * 2.6, 0.25, Math.sin(ang) * 2.6, 8, Math.PI / 2, -ang, 0); }
        const { g } = group(p.x, p.y);
        const fm = [basic(0xffa040, 0.9, true), basic(0xffd060, 0.9, true)];
        const flames = Array.from({ length: 5 }, (_, i) => { const m = new THREE.Mesh(cylG(0, 1, 6), fm[i % 2]); m.position.set((i % 3 - 1) * 0.22, 0.6, ((i + 1) % 3 - 1) * 0.22); g.add(m); return m; });
        const light = new THREE.PointLight(0xffa040, 4, 9, 2); light.position.y = 1.2; g.add(light);
        ctx.anims.push((t) => { flames.forEach((m, i) => { const k = 0.8 + Math.sin(t * 9 + i * 2.1) * 0.2; m.scale.set(0.3 * k, 1.1 * k + (i === 0 ? 0.4 : 0), 0.3 * k); }); light.intensity = 3 + Math.sin(t * 11) * 0.8; });
        smoke(p.x, p.y, 1.8, 0.5, 0.6);
        break;
      }
      case 'tent':
        b.at(p.x, p.y, a);
        b.prism(p.c ?? K.yellow, 4.0, 2.3, 3.6, 0, 0, 0);
        b.geo(prism(), new THREE.Color(p.c ?? K.yellow).multiplyScalar(0.55).getHex(), 2.02, 0, 0, 0.04, 1.6, 1.2);
        break;
      case 'stump': b.at(p.x, p.y, a); b.cyl(K.wood, 0.55, 0.6, 0, 0.3, 0, 10, 0, 0, 0, 0.9); b.cyl(0xd9b27a, 0.5, 0.02, 0, 0.61, 0, 10); break;
      case 'log': b.at(p.x, p.y, a); b.cyl(K.wood, 0.4, 3.4, 0, 0.4, 0, 9, 0, 0, Math.PI / 2); b.cyl(0xd9b27a, 0.37, 0.02, 1.71, 0.4, 0, 9, 0, 0, Math.PI / 2); b.blob(0x5f9a38, 0.35, 0.3, 0.75, 0, 1.6, 0.4, 1); break;
      case 'mushroom':
        b.at(p.x, p.y, a);
        for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.35, z = (i % 2) * 0.3, h = 0.3 + i * 0.12; b.cyl(K.white, 0.07, h, x, h / 2, z, 6); b.half(K.red, 0.22 - i * 0.03, x, h, z, 0.7); b.sph(K.white, 0.04, x + 0.08, h + 0.12, z); }
        break;
      case 'fern':
        b.at(p.x, p.y, a, s);
        for (let i = 0; i < 6; i++) { const ang = i / 6 * Math.PI * 2; b.geo(unit.sph, 0x4f9a3f, Math.cos(ang) * 0.5, 0.25, Math.sin(ang) * 0.5, 0.6, 0.06, 0.18, 0, -ang, 0.5); }
        break;
      // ---------- Kleinkram ----------
      case 'flower':
        b.at(p.x, p.y, a);
        for (let i = 0; i < 6; i++) {
          const x = Math.cos(i * 2.4) * (0.2 + i * 0.12), z = Math.sin(i * 2.4) * (0.2 + i * 0.12), h = 0.22 + (i % 3) * 0.06;
          b.box(0x3f8f3a, 0.03, h, 0.03, x, h / 2, z);
          b.geo(new THREE.CircleGeometry(0.12, 5).rotateX(-Math.PI / 2), p.c ?? K.white, x, h, z);
          b.box(0xffd23f, 0.06, 0.03, 0.06, x, h + 0.01, z);
        }
        break;
      case 'reed':
        b.at(p.x, p.y, a, s);
        for (let i = 0; i < 7; i++) { const x = Math.cos(i * 2.2) * 0.35, z = Math.sin(i * 2.2) * 0.35, h = 1.2 + (i % 3) * 0.3; b.geo(cylG(0, 1, 4), 0x5f9a38, x, h / 2, z, 0.05, h, 0.05, (i % 2 - 0.5) * 0.15, 0, 0); if (i % 3 === 0) b.cyl(0x6a4a2a, 0.06, 0.3, x, h * 0.8, z, 6); }
        break;
      case 'lily':
        b.at(p.x, p.y, a, s);
        b.geo(new THREE.CircleGeometry(0.6, 12, 0.3, Math.PI * 1.8).rotateX(-Math.PI / 2), 0x4e9a3a, 0, 0.07, 0);
        b.geo(new THREE.CircleGeometry(0.4, 10, 0.3, Math.PI * 1.8).rotateX(-Math.PI / 2), 0x5aa844, 0.9, 0.07, 0.4);
        if (rnd() < 0.5) b.sph(K.pink, 0.16, 0.1, 0.14, 0.1, 1, 0.6, 1);
        break;
      case 'stone': b.at(p.x, p.y, a, s); b.blob(K.stone, 0.45, 0, 0.18, 0, 1.2, 0.6, 1); break;
      default: break;
    }
  }
  // Stromleitungen: durchhängende Drähte zwischen den Masten
  {
    const pts: number[] = [];
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i], c = poles[i + 1];
      if (!a.h || Math.hypot(a.x - c.x, a.y - c.y) > 700) continue;
      for (const off of [-0.9, 0, 0.9]) {
        const ang = a.a ?? 0, px = -Math.sin(ang) * off, pz = Math.cos(ang) * off;
        const n = 10;
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          const P = (t: number) => [(a.x + (c.x - a.x) * t) * S + px, 6.45 - Math.sin(t * Math.PI) * 0.8, (a.y + (c.y - a.y) * t) * S + pz];
          pts.push(...P(t0), ...P(t1));
        }
      }
    }
    if (pts.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const m = new THREE.LineBasicMaterial({ color: 0x2b2f38 });
      ctx.world.add(new THREE.LineSegments(g, m)); ctx.dispose.push(g, m);
    }
  }
  for (const l of parts.values()) {
    const g = mergeGeometries(l.geos, false);
    l.geos.forEach((x) => x.dispose());
    if (!g) continue;
    const mesh = new THREE.Mesh(g, l.m);
    mesh.castShadow = !(l.m as THREE.MeshBasicMaterial).transparent;
    mesh.receiveShadow = true;
    ctx.world.add(mesh);
    ctx.dispose.push(g);
  }
}
