import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Heil- und Schild-Gegenstände: abgerundete Formen, klare Farben, kleine Details (Griff, Schnallen, Leuchtkern).
 * Teile werden je Material zu einem Mesh zusammengefasst (wenig Draw-Calls, es liegen viele davon herum).
 */
type Kind = 'medkit' | 'bigmed' | 'armor';
const cache = new Map<Kind, THREE.Group>();
let mats: Record<string, THREE.Material> | null = null;

function getMats(gradient: THREE.Texture) {
  if (mats) return mats;
  const toon = (c: number, e = 0x000000) => new THREE.MeshToonMaterial({ color: c, gradientMap: gradient, emissive: e });
  mats = {
    white: toon(0xf4f6f8), whiteShade: toon(0xd5dbe2), red: toon(0xe5373a), redDark: toon(0xa8222a), redGlow: toon(0xff4a4f, 0x5a0808),
    metal: toon(0x8d95a3), dark: toon(0x2b2f38), green: toon(0x3fd06a, 0x0c3a1a),
    blue: toon(0x2f7fe8), blueDark: toon(0x1d4fa8), blueRim: toon(0xbfe3ff), core: new THREE.MeshBasicMaterial({ color: 0x7ff6ff }),
    coreGlow: new THREE.MeshBasicMaterial({ color: 0x9ff8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }),
    gold: toon(0xffc93c),
    greenMain: toon(0x3fcf6a), greenMain2: toon(0x2fbf5c), greenDark: toon(0x1f8a43),
    healGlow: new THREE.MeshBasicMaterial({ color: 0xc8ffd8 }), healLiquid: new THREE.MeshBasicMaterial({ color: 0x5dff8a }),
    syringeGlass: new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient, transparent: true, opacity: 0.5 }), shieldGlow: new THREE.MeshBasicMaterial({ color: 0xcfe8ff }),
  };
  return mats;
}

export function buildItem(kind: Kind, gradient: THREE.Texture): THREE.Group {
  const hit = cache.get(kind);
  if (hit) return hit.clone();
  const M = getMats(gradient);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const tmp = new THREE.Object3D();
  const put = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    tmp.position.set(x, y, z); tmp.rotation.set(rx, ry, rz); tmp.updateMatrix();
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(tmp.matrix);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const l = parts.get(mat) ?? []; l.push(g); parts.set(mat, l);
  };
  const rb = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, r: number, rx = 0, ry = 0, rz = 0) =>
    put(new RoundedBoxGeometry(sx, sy, sz, 3, Math.min(r, sx / 2.1, sy / 2.1, sz / 2.1)), mat, x, y, z, rx, ry, rz);
  const cyl = (mat: THREE.Material, r: number, h: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, seg = 20) =>
    put(new THREE.CylinderGeometry(r, r, h, seg), mat, x, y, z, rx, ry, rz);
  /** Kreuz aus zwei abgerundeten Balken (liegt in der Ebene mit Normalen-Achse 'axis') */
  const cross = (mat: THREE.Material, size: number, thick: number, depth: number, x: number, y: number, z: number, axis: 'y' | 'x') => {
    if (axis === 'y') { rb(mat, size, depth, thick, x, y, z, thick * 0.35); rb(mat, thick, depth, size, x, y, z, thick * 0.35); }
    else { rb(mat, depth, size, thick, x, y, z, thick * 0.35); rb(mat, depth, thick, size, x, y, z, thick * 0.35); }
  };

  const g = new THREE.Group();
  /** Symbol (Kreuz oder Schild) als flaches Relief auf der Oberseite */
  const icon = (shape: 'cross' | 'shield', size: number, mat: THREE.Material, x: number, y: number, z: number, upright = false) => {
    if (shape === 'cross') {
      const t = size * 0.34, d = 0.035;
      if (upright) { rb(mat, size, t, d, x, y, z, t * 0.3); rb(mat, t, size, d, x, y, z, t * 0.3); }
      else { rb(mat, size, d, t, x, y, z, t * 0.3); rb(mat, t, d, size, x, y, z, t * 0.3); }
    } else {
      const sh = new THREE.Shape();
      sh.moveTo(-0.5, 0.45); sh.quadraticCurveTo(0, 0.6, 0.5, 0.45); sh.lineTo(0.5, 0.05); sh.quadraticCurveTo(0.45, -0.38, 0, -0.6); sh.quadraticCurveTo(-0.45, -0.38, -0.5, 0.05); sh.closePath();
      const e = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 12 });
      if (upright) e.scale(size, size, 1); else { e.rotateX(-Math.PI / 2); e.scale(size, 1, size); }
      put(e, mat, x, y, z);
    }
  };
  if (kind === 'medkit') {
    // kleine Heilung: Spritze mit grüner Heilflüssigkeit (liegt flach, etwas größer, damit man sie gut sieht)
    const k = 1.5;
    const glassM = M.syringeGlass;
    put(new THREE.CylinderGeometry(0.08 * k, 0.08 * k, 0.5 * k, 18), glassM, 0, 0.13 * k, 0, 0, 0, Math.PI / 2);
    put(new THREE.CylinderGeometry(0.065 * k, 0.065 * k, 0.36 * k, 16), M.healLiquid, 0.04 * k, 0.13 * k, 0, 0, 0, Math.PI / 2);
    for (const x of [-0.1, 0.05, 0.2]) put(new THREE.CylinderGeometry(0.083 * k, 0.083 * k, 0.012 * k, 18), M.white, x * k, 0.13 * k, 0, 0, 0, Math.PI / 2);
    put(new THREE.CylinderGeometry(0.11 * k, 0.11 * k, 0.03 * k, 18), M.white, -0.25 * k, 0.13 * k, 0, 0, 0, Math.PI / 2);
    put(new THREE.CylinderGeometry(0.025 * k, 0.025 * k, 0.18 * k, 8), M.dark, -0.34 * k, 0.13 * k, 0, 0, 0, Math.PI / 2);
    put(new THREE.CylinderGeometry(0.065 * k, 0.065 * k, 0.03 * k, 14), M.dark, -0.43 * k, 0.13 * k, 0, 0, 0, Math.PI / 2);
    put(new THREE.CylinderGeometry(0.04 * k, 0.07 * k, 0.05 * k, 14), M.greenDark, 0.27 * k, 0.13 * k, 0, 0, 0, Math.PI / 2);
    put(new THREE.CylinderGeometry(0.008 * k, 0.008 * k, 0.16 * k, 6), M.metal, 0.37 * k, 0.13 * k, 0, 0, 0, Math.PI / 2);
    for (const [mat, geos] of parts) { const mesh = new THREE.Mesh(mergeGeometries(geos)!, mat); mesh.castShadow = true; g.add(mesh); }
    g.position.y = -0.1;
    cache.set(kind, g);
    return g.clone();
  }
  // Design A: Hartschalen-Koffer – farbiges Unterteil, heller Deckel, dunkles Feld mit leuchtendem Symbol, Seitengriffe, Schnallen
  const big = kind === 'bigmed', sc = big ? 1.25 : 1;
  const col = kind === 'armor' ? { main: M.blue, dark: M.blueDark, glow: M.shieldGlow } : { main: big ? M.greenMain2 : M.greenMain, dark: M.greenDark, glow: M.healGlow };
  const w = 0.8 * sc, d = 0.6 * sc, h = 0.42 * sc;
  rb(col.main, w, h * 0.62, d, 0, h * 0.31, 0, 0.08);
  rb(M.white, w * 1.02, h * 0.42, d * 1.02, 0, h * 0.78, 0, 0.09);
  rb(col.dark, w * 1.04, 0.05, d * 1.04, 0, h * 0.6, 0, 0.02);
  rb(col.dark, w * 0.56, 0.03, d * 0.6, 0, h * 1.0, 0, 0.05);
  icon(kind === 'armor' ? 'shield' : 'cross', d * 0.42, col.glow, 0, h * 1.03, 0);
  for (const sx of [-1, 1]) rb(M.dark, 0.06 * sc, 0.1 * sc, d * 0.5, sx * (w / 2 + 0.03 * sc), h * 0.45, 0, 0.03);
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) rb(M.metal, 0.09 * sc, 0.1 * sc, 0.04, sx * w * 0.32, h * 0.62, sz * (d / 2 + 0.01), 0.015);
  // Symbol auch vorne und hinten, damit man es beim Drehen immer sieht
  for (const sz of [-1, 1]) icon(kind === 'armor' ? 'shield' : 'cross', h * 0.36, col.glow, 0, h * 0.3, sz * (d / 2 + 0.02), true);
  g.position.y = -0.2 * sc;
  for (const [mat, geos] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geos)!, mat);
    mesh.castShadow = mat !== M.coreGlow;
    g.add(mesh);
  }
  cache.set(kind, g);
  return g.clone();
}
