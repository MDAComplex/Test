import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import jackalUrl from '../assets/plush/jackal.glb?inline';
import luchadorUrl from '../assets/plush/luchador.glb?inline';

/**
 * Plüsch-Figuren (statische Modelle) für unser Animations-Skelett aufbereiten:
 * das Modell besteht aus vielen Einzelteilen; jedes Teil wird nach seiner Lage einem Knochen zugeordnet
 * (Kopf, Oberkörper, Becken, Bein, Ober-/Unterarm) und relativ zu dessen Gelenk gespeichert.
 * Arme werden dabei gerade nach unten ausgerichtet (der Luchador winkt im Modell).
 */
export type PlushKind = 'jackal' | 'luchador';
export const PLUSH_KINDS: PlushKind[] = ['jackal', 'luchador'];

type V3 = [number, number, number];
interface PlushSpec {
  url: string;
  /** Gelenke im Modell (Modell-Koordinaten: y oben, vorne +z, rechts der Figur = -x) */
  hipY: number; legX: number; torsoY: number; neckY: number;
  /** Schulter, Ellbogen, Handgelenk der linken (+x) und rechten (-x) Seite */
  arms: { s: V3; e: V3; w: V3 }[];
  /** Teile, die wegfallen (z. B. der Stab, weil die Figur Waffen hält) */
  drop?: (c: Comp) => boolean;
}
interface Comp { cx: number; cy: number; cz: number; min: THREE.Vector3; max: THREE.Vector3 }

const SPECS: Record<PlushKind, PlushSpec> = {
  jackal: {
    url: jackalUrl, hipY: 0.34, legX: 0.08, torsoY: 0.42, neckY: 0.79,
    arms: [
      { s: [0.2, 0.72, 0], e: [0.23, 0.56, 0], w: [0.26, 0.37, 0.03] },
      { s: [-0.2, 0.72, 0], e: [-0.23, 0.56, 0], w: [-0.26, 0.37, 0.03] },
    ],
    drop: (c) => (Math.abs(c.cx) > 0.27 && (c.max.y - c.min.y > 0.4 || c.cy < 0.12)) || (Math.abs(c.cx) > 0.2 && c.cy > 1.1),
  },
  luchador: {
    url: luchadorUrl, hipY: 0.4, legX: 0.1, torsoY: 0.47, neckY: 0.76,
    arms: [
      // im Modell winkt der linke Arm (Oberarm waagerecht, Unterarm senkrecht)
      { s: [0.17, 0.72, 0], e: [0.37, 0.74, 0.03], w: [0.38, 0.98, 0.05] },
      { s: [-0.2, 0.72, 0], e: [-0.26, 0.56, 0], w: [-0.29, 0.38, 0.03] },
    ],
  },
};

/** Skalierung Modell -> Spiel (das Modell ist ca. 1,5 m groß) */
export const PLUSH_SCALE = 1.75;

export type PlushBone = 'head' | 'torso' | 'pelvis' | 'legR' | 'legL' | 'upR' | 'upL' | 'loR' | 'loL';
export interface PlushData {
  /** Gelenk-Positionen fürs Skelett (Spiel-Koordinaten, Körper-Raum) */
  hipY: number; legZ: number; torsoY: number; headY: number;
  shoulder: { y: number; z: number; x: number }[];
  /** Geometrien je Knochen und Farbe, schon relativ zum Gelenk */
  parts: { bone: PlushBone; color: THREE.Color; geo: THREE.BufferGeometry }[];
}

const cache = new Map<PlushKind, PlushData>();
let loading: Promise<void> | null = null;

export function plushData(kind: PlushKind) { return cache.get(kind) ?? null; }

/** lädt beide Plüsch-Figuren einmal (im Hintergrund); danach sind sie sofort verfügbar */
export function loadPlush(): Promise<void> {
  if (loading) return loading;
  const loader = new GLTFLoader();
  loading = Promise.all(PLUSH_KINDS.map((k) => loader.loadAsync(SPECS[k].url).then((g) => { cache.set(k, process(g.scene, SPECS[k])); })))
    .then(() => undefined)
    .catch((e) => { console.warn('Plüsch-Figuren konnten nicht geladen werden', e); });
  return loading;
}

const tmpV = new THREE.Vector3();

function process(scene: THREE.Object3D, sp: PlushSpec): PlushData {
  const S = PLUSH_SCALE;
  // Modell -> Spiel: vorne (+z) wird +x, rechts der Figur (-x) wird +z
  const map = (v: THREE.Vector3) => v.set(v.z, v.y, -v.x);
  const buckets = new Map<string, { bone: PlushBone; color: THREE.Color; geos: THREE.BufferGeometry[] }>();
  const armSide = (x: number) => (x > 0 ? 0 : 1); // +x ist links der Figur (Spiel: arms[1]); Index in sp.arms
  // Ausrichtung je Armsegment: Modell-Richtung -> gerade nach unten
  const down = new THREE.Vector3(0, -1, 0);
  const segRot = sp.arms.map((a) => {
    const s = new THREE.Vector3(...a.s), e = new THREE.Vector3(...a.e), w = new THREE.Vector3(...a.w);
    return {
      up: new THREE.Quaternion().setFromUnitVectors(e.clone().sub(s).normalize(), down),
      lo: new THREE.Quaternion().setFromUnitVectors(w.clone().sub(e).normalize(), down),
      s, e, w,
    };
  });
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    src.applyMatrix4(mesh.matrixWorld);
    const pos = src.getAttribute('position') as THREE.BufferAttribute;
    const nor = src.getAttribute('normal') as THREE.BufferAttribute;
    const triCount = pos.count / 3;
    // Teile = zusammenhängende Dreiecke (gleiche Positionen verbinden)
    const key = new Map<string, number>();
    const vid = new Int32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const k = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
      let id = key.get(k);
      if (id === undefined) { id = key.size; key.set(k, id); }
      vid[i] = id;
    }
    const par = new Int32Array(key.size).map((_, i) => i);
    const find = (x: number): number => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (let t = 0; t < triCount; t++) {
      const a = find(vid[t * 3]), b = find(vid[t * 3 + 1]), c = find(vid[t * 3 + 2]);
      par[b] = a; par[find(c)] = a;
    }
    const groups = new Map<number, number[]>();
    for (let t = 0; t < triCount; t++) {
      const r = find(vid[t * 3]);
      let g = groups.get(r);
      if (!g) { g = []; groups.set(r, g); }
      g.push(t);
    }
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const color = mat.color.clone();
    for (const tris of groups.values()) {
      const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
      let cx = 0, cy = 0, cz = 0, n = 0;
      for (const t of tris) for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        tmpV.fromBufferAttribute(pos, i);
        min.min(tmpV); max.max(tmpV);
        cx += tmpV.x; cy += tmpV.y; cz += tmpV.z; n++;
      }
      const c: Comp = { cx: cx / n, cy: cy / n, cz: cz / n, min, max };
      if (sp.drop && sp.drop(c)) continue;
      // Zuordnung
      let bone: PlushBone;
      let pivot = new THREE.Vector3(0, 0, 0);
      let rot: THREE.Quaternion | null = null;
      const isArm = Math.abs(c.cx) >= 0.15 && c.cy > sp.hipY - 0.06 && c.cy < sp.neckY + 0.3 && c.min.z > -0.25;
      if (isArm) {
        const ai = armSide(c.cx), a = segRot[ai];
        // näher am Oberarm (Schulter-Ellbogen) oder am Unterarm (Ellbogen-Hand)?
        const p = new THREE.Vector3(c.cx, c.cy, c.cz);
        const dUp = distSeg(p, a.s, a.e), dLo = distSeg(p, a.e, a.w);
        const left = ai === 0;
        if (dUp < dLo) { bone = left ? 'upL' : 'upR'; pivot = a.s; rot = a.up; }
        else { bone = left ? 'loL' : 'loR'; pivot = a.e; rot = a.lo; }
      } else if (c.cy > sp.neckY + 0.02) {
        bone = 'head'; pivot = new THREE.Vector3(0, sp.neckY, 0);
      } else if (c.min.z < -0.3 || c.cy >= sp.torsoY + 0.04) {
        // Oberkörper, auch Umhang und Schwanz (hängen hinten)
        bone = 'torso'; pivot = new THREE.Vector3(0, sp.torsoY, 0);
      } else if (c.cy < sp.hipY - 0.03 && Math.abs(c.cx) > 0.03 && c.max.x - c.min.x < 0.3) {
        bone = c.cx < 0 ? 'legR' : 'legL'; pivot = new THREE.Vector3(c.cx < 0 ? -sp.legX : sp.legX, sp.hipY, 0);
      } else {
        bone = 'pelvis'; pivot = new THREE.Vector3(0, 0, 0);
      }
      // Dreiecke herauslösen und relativ zum Gelenk ablegen
      const P = new Float32Array(tris.length * 9), N = new Float32Array(tris.length * 9);
      let o2 = 0;
      for (const t of tris) for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        tmpV.fromBufferAttribute(pos, i).sub(pivot);
        if (rot) tmpV.applyQuaternion(rot);
        map(tmpV).multiplyScalar(S);
        P[o2] = tmpV.x; P[o2 + 1] = tmpV.y; P[o2 + 2] = tmpV.z;
        tmpV.fromBufferAttribute(nor, i);
        if (rot) tmpV.applyQuaternion(rot);
        map(tmpV);
        N[o2] = tmpV.x; N[o2 + 1] = tmpV.y; N[o2 + 2] = tmpV.z;
        o2 += 3;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      const bk = bone + '|' + color.getHexString();
      let b = buckets.get(bk);
      if (!b) { b = { bone, color, geos: [] }; buckets.set(bk, b); }
      b.geos.push(g);
    }
    src.dispose();
  });
  const parts = [...buckets.values()].map((b) => ({ bone: b.bone, color: b.color, geo: mergeGeometries(b.geos)! }));
  return {
    hipY: sp.hipY * S, legZ: sp.legX * S, torsoY: sp.torsoY * S, headY: (sp.neckY - sp.torsoY) * S,
    // Spiel: arms[0] = rechts (+z) = Modell -x (sp.arms[1]); arms[1] = links = Modell +x (sp.arms[0])
    shoulder: [sp.arms[1], sp.arms[0]].map((a) => ({ x: a.s[2] * S, y: (a.s[1] - sp.torsoY) * S, z: -a.s[0] * S })),
    parts,
  };
}

function distSeg(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}
