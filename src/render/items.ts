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
  if (kind === 'medkit') {
    // kleine weiße Erste-Hilfe-Tasche: abgerundet, rote Banderole, rote Kreuze oben und auf allen Seiten
    rb(M.white, 0.66, 0.42, 0.48, 0, 0, 0, 0.1);
    rb(M.red, 0.68, 0.08, 0.5, 0, -0.1, 0, 0.035);
    cross(M.redGlow, 0.32, 0.1, 0.04, 0, 0.215, 0, 'y');
    for (const sx of [-1, 1]) cross(M.red, 0.22, 0.075, 0.035, sx * 0.335, 0.05, 0, 'x');
    for (const sz of [-1, 1]) { rb(M.red, 0.075, 0.22, 0.035, 0, 0.05, sz * 0.245, 0.025); rb(M.red, 0.22, 0.075, 0.035, 0, 0.05, sz * 0.245, 0.025); }
    for (const z of [-0.17, 0.17]) rb(M.metal, 0.08, 0.06, 0.05, 0.31, 0.16, z, 0.015);
  } else if (kind === 'bigmed') {
    // großer roter Notfallkoffer: dunkler Rand, Griff oben, weiße Kreuze in runden Feldern auf allen Seiten, Metallschnallen
    rb(M.red, 0.98, 0.58, 0.62, 0, 0, 0, 0.12);
    rb(M.redDark, 1.0, 0.09, 0.64, 0, 0.15, 0, 0.045);
    for (const sx of [-1, 1]) {
      cyl(M.white, 0.19, 0.04, sx * 0.495, -0.04, 0, 0, 0, Math.PI / 2, 28);
      cross(M.redGlow, 0.24, 0.075, 0.04, sx * 0.515, -0.04, 0, 'x');
    }
    for (const sz of [-1, 1]) {
      cyl(M.white, 0.17, 0.04, 0, -0.04, sz * 0.315, Math.PI / 2, 0, 0, 28);
      rb(M.redGlow, 0.075, 0.22, 0.04, 0, -0.04, sz * 0.335, 0.025); rb(M.redGlow, 0.22, 0.075, 0.04, 0, -0.04, sz * 0.335, 0.025);
    }
    for (const x of [-0.3, 0.3]) for (const z of [-0.33, 0.33]) rb(M.metal, 0.1, 0.14, 0.04, x, 0.13, z, 0.015);
    for (const x of [-0.16, 0.16]) cyl(M.dark, 0.028, 0.14, x, 0.36, 0, 0, 0, 0, 10);
    rb(M.dark, 0.38, 0.06, 0.08, 0, 0.44, 0, 0.028);
    put(new THREE.SphereGeometry(0.035, 12, 8), M.green, 0.36, 0.3, 0.22);
  } else {
    // Schild: gewölbtes blaues Wappen mit hellem Rand, Mittelgrat, leuchtendem Kern und kleinen Nieten
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, 0.48); shape.quadraticCurveTo(0, 0.64, 0.5, 0.48);
    shape.lineTo(0.5, 0.06); shape.quadraticCurveTo(0.46, -0.38, 0, -0.64); shape.quadraticCurveTo(-0.46, -0.38, -0.5, 0.06); shape.closePath();
    const ext = (s: number, depth: number, bevel: number) => {
      const e = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14 });
      e.translate(0, 0, -depth / 2); e.scale(s, s, 1); return e;
    };
    put(ext(0.92, 0.1, 0.04), M.blueRim, 0, 0, -0.02);
    put(ext(0.78, 0.12, 0.035), M.blue, 0, 0, 0.01);
    // dunkle untere Hälfte für Tiefe
    const half = ext(0.74, 0.02, 0.01); half.translate(0, 0, 0.08);
    put(half, M.blueDark, 0, -0.18, 0, 0, 0, 0);
    rb(M.blueRim, 0.08, 0.86, 0.06, 0, 0.0, 0.1, 0.03);
    put(new THREE.OctahedronGeometry(0.15, 0), M.core, 0, 0.06, 0.15, 0, 0, Math.PI / 4);
    put(new THREE.SphereGeometry(0.24, 16, 10), M.coreGlow, 0, 0.06, 0.13);
    for (const [x, y] of [[-0.34, 0.34], [0.34, 0.34], [-0.3, -0.12], [0.3, -0.12]]) put(new THREE.SphereGeometry(0.035, 10, 8), M.gold, x, y, 0.1);
  }
  for (const [mat, geos] of parts) {
    const mesh = new THREE.Mesh(mergeGeometries(geos)!, mat);
    mesh.castShadow = mat !== M.coreGlow;
    g.add(mesh);
  }
  cache.set(kind, g);
  return g.clone();
}
