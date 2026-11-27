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
    shieldLiquid: new THREE.MeshBasicMaterial({ color: 0x6ad0ff }), techDark: toon(0x30343d), shieldDark: toon(0x2a3550), techScreen: toon(0x15181e),
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
  const flush = (target: THREE.Object3D) => {
    for (const [mat, geos] of parts) { const mesh = new THREE.Mesh(mergeGeometries(geos)!, mat); mesh.castShadow = true; target.add(mesh); }
    parts.clear();
  };
  const disc = (mat: THREE.Material, r: number, x: number, y: number, z: number) => put(new THREE.CircleGeometry(r, 24), mat, x, y, z);
  if (kind === 'medkit') {
    // kleine Medibox: kompakter, fast würfelförmiger Kasten, grüner Deckel (umgekehrt zum großen Medikit), Tragegurt oben
    rb(M.white, 0.5, 0.26, 0.42, 0, 0.13, 0, 0.09);
    rb(M.greenMain, 0.52, 0.12, 0.44, 0, 0.31, 0, 0.06);
    rb(M.healLiquid, 0.53, 0.025, 0.45, 0, 0.255, 0, 0.012);
    icon('cross', 0.2, M.white, 0, 0.375, 0);
    rb(M.dark, 0.06, 0.05, 0.3, 0, 0.4, 0, 0.02);
    for (const z of [-0.15, 0.15]) rb(M.dark, 0.06, 0.05, 0.05, 0, 0.37, z, 0.02);
    disc(M.techScreen, 0.075, 0, 0.12, 0.212);
    icon('cross', 0.09, M.healLiquid, 0, 0.12, 0.222, true);
    flush(g);
    g.position.y = -0.18;
    cache.set(kind, g);
    return g.clone();
  }
  if (kind === 'bigmed') {
    // großes Medikit (Tech-Koffer): dunkles Unterteil, grüner Leuchtstreifen, weißer Deckel mit eingelassenem Panel
    rb(M.techDark, 0.9, 0.3, 0.62, 0, 0.16, 0, 0.14);
    rb(M.white, 0.9, 0.26, 0.62, 0, 0.42, 0, 0.14);
    rb(M.healLiquid, 0.92, 0.04, 0.64, 0, 0.3, 0, 0.02);
    // Deckel: Leuchtfuge um ein erhöhtes Panel, darauf Ring und Kreuz, vorne zwei Lichtschlitze
    rb(M.healLiquid, 0.72, 0.02, 0.46, 0, 0.552, 0, 0.08);
    rb(M.whiteShade, 0.68, 0.035, 0.42, 0, 0.565, 0, 0.08);
    put(new THREE.TorusGeometry(0.15, 0.022, 8, 28), M.healLiquid, 0, 0.59, 0, Math.PI / 2);
    icon('cross', 0.19, M.greenMain, 0, 0.59, 0);
    for (const x of [-0.27, 0.27]) rb(M.healLiquid, 0.12, 0.02, 0.012, x, 0.48, 0.315, 0.008);
    for (const x of [-0.3, 0.3]) rb(M.metal, 0.1, 0.14, 0.05, x, 0.3, 0.32, 0.02);
    disc(M.techScreen, 0.1, 0, 0.15, 0.315);
    icon('cross', 0.12, M.healLiquid, 0, 0.15, 0.325, true);
  } else {
    // Schildkoffer: dunkelblaues Unterteil, blauer Leuchtstreifen, weißer Deckel mit Display und Leuchtrahmen
    rb(M.shieldDark, 0.82, 0.42, 0.56, 0, 0.23, 0, 0.1);
    rb(M.shieldLiquid, 0.84, 0.04, 0.58, 0, 0.28, 0, 0.02);
    rb(M.white, 0.76, 0.1, 0.5, 0, 0.47, 0, 0.05);
    rb(M.shieldLiquid, 0.42, 0.02, 0.36, 0, 0.523, 0, 0.06);
    rb(M.techScreen, 0.38, 0.03, 0.32, 0, 0.535, 0, 0.05);
    icon('shield', 0.22, M.shieldLiquid, 0, 0.555, 0);
    for (const x of [-0.3, 0.3]) rb(M.shieldLiquid, 0.1, 0.015, 0.012, x, 0.47, 0.256, 0.006);
    disc(M.techScreen, 0.11, 0, 0.21, 0.285);
    icon('shield', 0.13, M.shieldLiquid, 0, 0.21, 0.295, true);
  }
  flush(g);
  g.position.y = -0.2;
  cache.set(kind, g);
  return g.clone();
}
