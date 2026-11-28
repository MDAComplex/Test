import { plushData, PlushKind, PLUSH_KINDS } from './plush';
import * as THREE from 'three';
import { ChuteDesign, WHITE_CHUTE } from '../chute';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Figur mit Gelenken (Hüfte/Knie, Schulter/Ellbogen), zeigt nach +X, Füße bei y = 0 */
export interface Rig {
  body: THREE.Group;
  torso: THREE.Group;
  /** Becken mit Beinen: dreht beim Gehen mit dem vorschwingenden Bein */
  pelvis: THREE.Group;
  head: THREE.Group;
  /** [rechts, links]: Oberschenkel-Gruppe und Knie-Gruppe */
  legs: { hip: THREE.Object3D; knee: THREE.Object3D }[];
  /** [rechts, links]: Schulter-Gruppe und Ellbogen-Gruppe */
  arms: { shoulder: THREE.Object3D; elbow: THREE.Object3D }[];
  gunPivot: THREE.Group;
  gunKick: THREE.Group;
  shirtMat: THREE.MeshToonMaterial;
  mats: THREE.Material[];
  /** Plüsch-Figuren haben andere Proportionen: Höhe des Oberkörpers, Waffen-Höhenversatz, Beinlänge relativ */
  torsoY?: number;
  gunDy?: number;
  hipK?: number;
}

export type CharKind = 'man' | 'woman' | PlushKind;

/** Schalter für die lebendigeren Animationen (Einstellungen: „Lebendig“ / „Klassisch“) */
export const ANIM = { lively: true };
/** Outfit über der Grundfigur: 'none' = normale Kleidung in der gewählten Farbe */
export type Outfit = 'none' | 'astronaut' | 'skeleton' | 'office' | 'jogger';
export const OUTFITS: { id: Outfit; name: string }[] = [
  { id: 'none', name: 'Normal' },
  { id: 'astronaut', name: 'Astronaut' },
  { id: 'skeleton', name: 'Skelett' },
  { id: 'office', name: 'Büro' },
  { id: 'jogger', name: 'Jogger' },
];
export type ChuteKind = 'round' | 'wing';

const SKIN_TONES = [0xf7d2ad, 0xeec29a, 0xd9a274, 0xb57a50, 0x8d5a3a];
const HAIR_COLORS = [0x3a2a1e, 0x1f1a17, 0x7a4a26, 0xc89a55, 0xa4472a];

/** geteilte Geometrien (einmal erzeugt) */
const G = {
  capsule: new THREE.CapsuleGeometry(1, 1, 8, 20),
  sphere: new THREE.SphereGeometry(1, 28, 20),
  hemi: new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
  // abgerundete Kanten statt harter Würfel, damit nichts eckig wirkt
  box: new RoundedBoxGeometry(1, 1, 1, 4, 0.3),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  ring: new THREE.TorusGeometry(1, 0.3, 10, 28),
  cone: new THREE.ConeGeometry(1, 1, 14),
  /** dicke, runde Sneaker-Form */
  shoe: new THREE.CapsuleGeometry(1, 1.2, 8, 16).rotateZ(Math.PI / 2),
};

/**
 * Durchgehender Körperteil (Arm/Bein) als ein Stück, das sich am Gelenk weich biegt.
 * Zylinder entlang -Y von 0 bis -(l1 + l2); Gelenk bei -l1. Optional zwei Materialien
 * (z. B. Ärmel oben, Haut unten) über Geometrie-Gruppen.
 */
const limbCache = new Map<string, THREE.BufferGeometry>();
function limbGeometry(l1: number, l2: number, r0: number, r1: number, r2: number, split: number) {
  const key = [l1, l2, r0, r1, r2, split].join(',');
  const hit = limbCache.get(key);
  if (hit) return hit;
  const total = l1 + l2;
  const part = (y0: number, y1: number) => {
    // Radius entlang der Länge: oben r0, am Gelenk r1, unten r2
    const segs = Math.max(2, Math.round(((y0 - y1) / total) * 18));
    const g = new THREE.CylinderGeometry(1, 1, y0 - y1, 18, segs, true);
    g.translate(0, (y0 + y1) / 2, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), d = -y;
      const r = d < l1 ? r0 + (r1 - r0) * (d / l1) : r1 + (r2 - r1) * ((d - l1) / l2);
      pos.setX(i, pos.getX(i) * r);
      pos.setZ(i, pos.getZ(i) * r);
    }
    return g;
  };
  // runde Kappen oben und unten
  const capTop = new THREE.SphereGeometry(r0, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const capBot = new THREE.SphereGeometry(r2, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  capBot.translate(0, -total, 0);
  const pieces = split > 0
    ? [mergeGroup([capTop, part(0, -split)]), mergeGroup([part(-split, -total), capBot])]
    : [mergeGroup([capTop, part(0, -total), capBot])];
  const geo = mergeGeometriesSimple(pieces, split > 0);
  // Skinning: Gewicht weich vom oberen zum unteren Knochen um das Gelenk
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const idx: number[] = [], wts: number[] = [];
  const blend = 0.08;
  for (let i = 0; i < pos.count; i++) {
    const d = -pos.getY(i);
    let w = (d - (l1 - blend)) / (blend * 2);
    w = Math.min(1, Math.max(0, w));
    w = w * w * (3 - 2 * w);
    idx.push(0, 1, 0, 0);
    wts.push(1 - w, w, 0, 0);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  geo.computeVertexNormals();
  limbCache.set(key, geo);
  return geo;
}

function mergeGroup(list: THREE.BufferGeometry[]) {
  return mergeGeometriesSimple(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
}

/** kleine Variante von mergeGeometries (nur position/normal/uv), optional mit einer Gruppe je Teil */
function mergeGeometriesSimple(list: THREE.BufferGeometry[], groups: boolean) {
  const out = new THREE.BufferGeometry();
  const attrs = ['position', 'normal', 'uv'];
  let offset = 0;
  const arrays: Record<string, number[]> = { position: [], normal: [], uv: [] };
  list.forEach((g0, gi) => {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const n = g.attributes.position.count;
    for (const a of attrs) {
      const at = g.attributes[a] as THREE.BufferAttribute | undefined;
      const size = a === 'uv' ? 2 : 3;
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arrays[a].push(at ? at.array[i * size + k] : 0);
    }
    if (groups) out.addGroup(offset, n, gi);
    offset += n;
  });
  out.setAttribute('position', new THREE.Float32BufferAttribute(arrays.position, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normal, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(arrays.uv, 2));
  return out;
}

/** Skinned Mesh für Arm/Bein; die beiden Knochen sind die Gelenk-Objekte des Rigs */
const placedCache = new Map<string, THREE.BufferGeometry>();
function skinnedLimb(geo: THREE.BufferGeometry, mats: THREE.Material | THREE.Material[], top: THREE.Bone, joint: THREE.Bone) {
  // Geometrie an die Gelenkposition verschieben (Ruhepose), damit das Skinning stimmt
  const p = top.position;
  const key = geo.uuid + [p.x, p.y, p.z].join(',');
  let placed = placedCache.get(key);
  if (!placed) {
    placed = geo.clone();
    placed.translate(p.x, p.y, p.z);
    placedCache.set(key, placed);
  }
  const mesh = new THREE.SkinnedMesh(placed, mats);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return { mesh, bind: () => mesh.bind(new THREE.Skeleton([top, joint])) };
}

export function makeToon(gradient: THREE.Texture) {
  const cache = new Map<number, THREE.MeshToonMaterial>();
  return (c: number) => {
    let m = cache.get(c);
    if (!m) { m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradient }); cache.set(c, m); }
    return m;
  };
}

export function buildCharacter(opts: {
  kind: CharKind;
  shirt: number;
  seed: number;
  gradient: THREE.Texture;
  toon: (c: number) => THREE.MeshToonMaterial;
  outfit?: Outfit;
}): Rig {
  const { toon } = opts;
  let kind = opts.kind;
  if ((PLUSH_KINDS as string[]).includes(kind)) {
    const pd = plushData(kind as PlushKind);
    if (pd) return buildPlush(pd, toon);
    kind = 'man'; // noch nicht geladen: vorerst normale Figur
  }
  const outfit = opts.outfit ?? 'none';
  const astro = outfit === 'astronaut', skel = outfit === 'skeleton', office = outfit === 'office', jog = outfit === 'jogger';
  const NAVY = 0x252a44;
  const rnd = (() => { let s = (opts.seed * 2654435761) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const skinTone = SKIN_TONES[Math.floor(rnd() * SKIN_TONES.length)];
  const hairTone = HAIR_COLORS[Math.floor(rnd() * HAIR_COLORS.length)];
  // Farben je Outfit (Vorlagen: Astronaut weiß/orange, Skelett schwarz/weiß, Büro Hemd/Krawatte)
  const SUIT = 0xebe6e1, GLOVE = 0x2f2f36, BLACK = 0x17171b, BONE = 0xf4f2ee, ORANGE = 0xff7a1a;
  const skin = toon(office ? 0xecb48a : jog ? 0xf0c08e : skinTone);
  const hair = toon(office ? 0x3d2a22 : jog ? 0xe3b878 : hairTone);
  const shirtColor = astro ? SUIT : skel ? BLACK : office ? 0xf1eef3 : jog ? NAVY : opts.shirt;
  const shirtMat = new THREE.MeshToonMaterial({ color: shirtColor, gradientMap: opts.gradient });
  const shirtDark = new THREE.MeshToonMaterial({
    color: astro ? 0xcfc9c3 : skel ? BLACK : office ? 0xdedae3 : jog ? 0xeeeaf0 : new THREE.Color(opts.shirt).multiplyScalar(0.7),
    gradientMap: opts.gradient,
  });
  const pants = toon(astro ? SUIT : skel ? BLACK : office ? 0x2c2633 : jog ? NAVY : kind === 'man' ? 0x3d5480 : 0x2e2f3b);
  const shoe = toon(astro ? GLOVE : skel ? BLACK : office ? 0x1d1b22 : jog ? 0x8c8f99 : 0xf1f1f1);
  const sole = toon(skel || jog ? BONE : office ? 0x111114 : 0x2a2a30);
  const dark = toon(0x1c1c22);
  const white = toon(0xffffff);
  const belt = toon(astro ? GLOVE : skel ? BLACK : office ? 0x1b1a1f : jog ? NAVY : 0x4a3626);
  /** Unterarm, Hände, Hals: beim Astronauten Anzug/Handschuhe, beim Skelett schwarz */
  const forearm = astro ? toon(SUIT) : skel ? toon(BLACK) : skin;
  const handMat = astro ? toon(GLOVE) : skel ? toon(BLACK) : skin;
  const neckMat = astro ? toon(GLOVE) : skel ? toon(BLACK) : skin;
  const bone = toon(BONE), orange = toon(ORANGE), glove = toon(GLOVE), grey = toon(0x55555e);

  const body = new THREE.Group();
  const mk = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const man = kind === 'man';
  const shoulderW = man ? 0.38 : 0.34;

  // Beine: Hüfte -> Knie -> Fuß
  const binds: (() => void)[] = [];
  const legGeo = limbGeometry(0.44, 0.38, man ? 0.145 : 0.135, man ? 0.12 : 0.112, 0.105, jog ? 0.24 : 0);
  const pelvis = new THREE.Group();
  body.add(pelvis);
  const legs = [0.15, -0.15].map((z) => {
    // Knochen: Hüfte -> Knie; ein durchgehendes Hosenbein darüber
    const holder = new THREE.Group();
    pelvis.add(holder);
    const hip = new THREE.Bone();
    hip.position.set(0, 0.9, z);
    const knee = new THREE.Bone();
    knee.position.y = -0.44;
    hip.add(knee);
    const limb = skinnedLimb(legGeo, jog ? [pants, skin] : pants, hip, knee);
    limb.mesh.add(hip);
    holder.add(limb.mesh);
    binds.push(limb.bind);
    // runder, dicker Sneaker mit heller Sohle
    mk(knee, G.shoe, shoe, 0.08, -0.4, 0, 0.105, 0.085, 0.105);
    mk(knee, G.box, sole, 0.08, -0.455, 0, 0.37, 0.05, 0.21);
    if (astro) {
      mk(knee, G.box, glove, 0.125, -0.02, 0, 0.06, 0.17, 0.17); // Knieschoner
      mk(knee, G.cyl, glove, 0.02, -0.31, 0, 0.13, 0.11, 0.13); // Stiefelschaft
      mk(knee, G.box, toon(SUIT), 0.17, -0.38, 0, 0.12, 0.06, 0.15); // helle Stiefelkappe
    } else if (jog) {
      mk(knee, G.cyl, white, 0, -0.3, 0, 0.112, 0.11, 0.112); // Socken
      mk(hip, G.box, white, 0, -0.11, (z > 0 ? 1 : -1) * 0.143, 0.035, 0.22, 0.02); // Streifen an den Shorts
    } else if (skel) {
      mk(hip, G.box, bone, 0.145, -0.22, 0, 0.035, 0.32, 0.06); // Oberschenkelknochen
      mk(knee, G.sphere, bone, 0.122, 0, 0, 0.04, 0.055, 0.055); // Kniescheibe
      mk(knee, G.box, bone, 0.115, -0.19, 0, 0.035, 0.26, 0.05); // Schienbein
      mk(knee, G.box, bone, 0.2, -0.42, 0, 0.07, 0.08, 0.15); // Zehenkappe
    }
    return { hip, knee };
  });
  // Becken
  mk(pelvis, G.box, pants, 0, 0.94, 0, 0.3, 0.2, man ? 0.4 : 0.38);
  if (skel) {
    // Beckenknochen in Schmetterlingsform
    mk(pelvis, G.box, bone, 0.155, 0.95, 0, 0.03, 0.06, 0.12);
    for (const z of [0.1, -0.1]) mk(pelvis, G.sphere, bone, 0.15, 0.97, z, 0.03, 0.07, 0.08);
  }

  // Oberkörper (mit eigener Gruppe für die Gegendrehung beim Gehen)
  const torso = new THREE.Group();
  torso.position.y = 1.0;
  body.add(torso);
  mk(torso, G.capsule, shirtMat, 0, 0.3, 0, 0.24, man ? 0.2 : 0.18, man ? 0.36 : 0.31);
  mk(torso, G.cyl, belt, 0, 0.02, 0, man ? 0.25 : 0.23, 0.06, man ? 0.34 : 0.3);
  // Kragen
  mk(torso, G.ring, shirtDark, 0, 0.6, 0, 0.13, 0.13, 0.13).rotation.x = Math.PI / 2;
  if (!man && outfit === 'none') mk(torso, G.capsule, shirtMat, 0.08, 0.36, 0, 0.16, 0.08, 0.26);
  // Hals
  mk(torso, G.cyl, neckMat, 0, 0.66, 0, 0.09, 0.14, 0.09);
  if (astro) {
    // Brustpanel mit orangen Leuchtbalken
    mk(torso, G.box, grey, 0.235, 0.42, 0, 0.06, 0.17, 0.24);
    for (const y of [0.47, 0.42, 0.37]) mk(torso, G.box, orange, 0.268, y, -0.035, 0.02, 0.025, 0.11);
    mk(torso, G.box, orange, 0.268, 0.44, 0.075, 0.02, 0.06, 0.035);
    // Gurtzeug über den Schultern und Schnalle
    for (const z of [0.15, -0.15]) {
      mk(torso, G.box, glove, 0.215, 0.3, z, 0.04, 0.5, 0.05);
      mk(torso, G.box, glove, -0.215, 0.3, z, 0.04, 0.5, 0.05);
    }
    mk(torso, G.box, toon(0xb9bcc2), 0.255, 0.02, 0, 0.03, 0.07, 0.11);
    // Rucksack mit Lampen
    mk(torso, G.box, toon(SUIT), -0.29, 0.38, 0, 0.18, 0.42, 0.36);
    mk(torso, G.box, grey, -0.385, 0.46, 0, 0.02, 0.09, 0.18);
    mk(torso, G.box, orange, -0.39, 0.46, 0, 0.015, 0.03, 0.1);
    mk(torso, G.box, grey, -0.385, 0.3, 0, 0.02, 0.06, 0.18);
    for (const z of [0.185, -0.185]) mk(torso, G.box, orange, -0.29, 0.44, z, 0.05, 0.1, 0.02);
    // Halsring
    mk(torso, G.cyl, glove, 0, 0.66, 0, 0.17, 0.07, 0.17);
  } else if (skel) {
    // Brustbein, Rippen, Wirbelsäule
    mk(torso, G.box, bone, 0.232, 0.34, 0, 0.03, 0.36, 0.05);
    [0.47, 0.39, 0.31, 0.23].forEach((y, i) => {
      for (const z of [0.12, -0.12]) {
        mk(torso, G.box, bone, 0.218, y, z, 0.03, 0.035, 0.17 - i * 0.015).rotation.x = z > 0 ? -0.22 : 0.22;
      }
    });
    for (let y = 0.1; y < 0.6; y += 0.09) mk(torso, G.box, bone, -0.232, y, 0, 0.03, 0.06, 0.07);
  } else if (office) {
    // Krawatte, Kragenspitzen, Gürtelschnalle
    const tie = toon(0x3a2f45);
    mk(torso, G.box, tie, 0.225, 0.56, 0, 0.05, 0.06, 0.07);
    mk(torso, G.box, tie, 0.24, 0.36, 0, 0.03, 0.34, 0.075);
    mk(torso, G.box, tie, 0.24, 0.18, 0, 0.03, 0.05, 0.05).rotation.x = Math.PI / 4;
    for (const z of [0.07, -0.07]) mk(torso, G.box, shirtDark, 0.17, 0.59, z, 0.06, 0.03, 0.09).rotation.x = z > 0 ? 0.5 : -0.5;
    mk(torso, G.box, toon(0xb9bcc2), 0.255, 0.02, 0, 0.03, 0.07, 0.1);
  }

  // Kopf: dreht sich vor dem Körper in die neue Richtung
  const head = new THREE.Group();
  head.position.y = 1.08;
  // großer Chibi-Kopf wie in den Vorlagen
  head.scale.setScalar(1.42);
  torso.add(head);
  if (astro) {
    // Helm mit schwarzem Visier und orangen Ohrmuscheln
    mk(head, G.sphere, toon(SUIT), -0.02, 0.03, 0, 0.47, 0.47, 0.46);
    mk(head, G.sphere, toon(0x111116), 0.2, 0.0, 0, 0.3, 0.34, 0.37);
    mk(head, G.sphere, white, 0.47, 0.15, 0.13, 0.03, 0.07, 0.05);
    for (const z of [0.45, -0.45]) {
      mk(head, G.cyl, orange, 0, 0, z, 0.14, 0.08, 0.14).rotation.x = Math.PI / 2;
      mk(head, G.cyl, grey, 0, 0, z * 1.04, 0.08, 0.08, 0.08).rotation.x = Math.PI / 2;
    }
  } else if (skel) {
    // schwarzer Kopf mit weißem Totenkopf vorne, Wirbel hinten
    mk(head, G.sphere, toon(BLACK), 0, 0, 0, 0.34, 0.36, 0.33);
    mk(head, G.sphere, bone, 0.2, 0.04, 0, 0.17, 0.25, 0.27);
    mk(head, G.box, bone, 0.27, -0.18, 0, 0.1, 0.1, 0.22);
    for (const ez of [0.1, -0.1]) mk(head, G.box, toon(BLACK), 0.36, 0.06, ez, 0.04, 0.09, 0.11).rotation.x = ez > 0 ? -0.4 : 0.4;
    mk(head, G.box, toon(BLACK), 0.37, -0.06, 0, 0.03, 0.05, 0.04);
    for (const ez of [0.05, -0.05]) mk(head, G.box, toon(BLACK), 0.32, -0.19, ez, 0.03, 0.08, 0.015);
    for (const [x, y] of [[-0.32, 0.13], [-0.345, 0], [-0.31, -0.14]]) mk(head, G.box, bone, x, y, 0, 0.04, 0.09, 0.1);
  } else {
    // weicher, breiter Kopf; Gesicht im Comic-Stil: ovale Augen, kräftige Brauen
    mk(head, G.sphere, skin, 0, 0, 0, 0.34, 0.35, 0.35);
    mk(head, G.sphere, skin, -0.02, -0.03, 0.34, 0.05, 0.07, 0.04);
    mk(head, G.sphere, skin, -0.02, -0.03, -0.34, 0.05, 0.07, 0.04);
    for (const ez of [0.12, -0.12]) {
      mk(head, G.sphere, dark, 0.305, 0.0, ez, 0.04, 0.072, 0.045);
      mk(head, G.box, dark, 0.31, 0.12, ez, 0.03, 0.035, 0.12).rotation.x = ez > 0 ? -0.38 : 0.38;
    }
    mk(head, G.box, toon(0x9a5a4a), 0.325, -0.13, 0, 0.02, 0.018, 0.05);
  }
  // Haare
  if (astro || skel) {
    // Helm bzw. Totenkopf ersetzen die Haare
  } else if (jog) {
    // blonde, strubbelige Frisur aus weichen Spitzen
    mk(head, G.hemi, hair, -0.06, 0.07, 0, 0.37, 0.38, 0.37).rotation.z = 0.35;
    mk(head, G.sphere, hair, -0.13, -0.03, 0, 0.25, 0.28, 0.32);
    const spikes: [number, number, number, number, number, number][] = [
      // x, y, z, Länge, rot.z, rot.x
      [0.22, 0.27, 0.1, 0.24, -1.15, 0.15], [0.2, 0.3, -0.08, 0.22, -1.0, -0.3], [0.06, 0.37, 0.12, 0.22, -0.5, 0.25],
      [0.02, 0.38, -0.12, 0.22, -0.3, -0.45], [-0.14, 0.35, 0.02, 0.22, 0.4, 0.05], [-0.28, 0.2, 0.08, 0.2, 1.1, 0.2],
      [-0.26, 0.2, -0.12, 0.2, 1.0, -0.3], [-0.05, 0.22, 0.3, 0.18, 0.1, 1.05], [-0.05, 0.22, -0.3, 0.18, 0.1, -1.05],
      [-0.25, 0.0, 0.18, 0.16, 1.6, 0.5], [-0.25, 0.0, -0.18, 0.16, 1.6, -0.5],
    ];
    for (const [x, y, z, l, rz, rx] of spikes) {
      const sp = mk(head, G.sphere, hair, x * 1.02, y * 1.02, z * 1.02, 0.07, l * 0.95, 0.13); // weiche, anliegende Strähne
      sp.rotation.set(rx, 0, rz);
    }
  } else if (office) {
    // volle, gewellte Frisur
    // Kappe nach hinten gekippt: Stirn frei, Hinterkopf bedeckt
    mk(head, G.hemi, hair, -0.07, 0.07, 0, 0.38, 0.39, 0.37).rotation.z = 0.35;
    mk(head, G.sphere, hair, -0.13, -0.04, 0, 0.26, 0.3, 0.33);
    mk(head, G.sphere, hair, 0.18, 0.28, 0.08, 0.17, 0.1, 0.2);
    mk(head, G.sphere, hair, 0.1, 0.32, -0.12, 0.18, 0.12, 0.2);
    for (const z of [0.15, -0.15]) mk(head, G.sphere, hair, -0.22, 0.22, z, 0.16, 0.14, 0.15);
    for (const z of [0.3, -0.3]) mk(head, G.sphere, hair, -0.04, 0.16, z, 0.14, 0.12, 0.07);
  } else if (man) {
    mk(head, G.hemi, hair, -0.03, 0.04, 0, 0.36, 0.36, 0.35);
    mk(head, G.box, hair, 0.22, 0.22, 0, 0.12, 0.08, 0.5).rotation.z = -0.35;
  } else {
    mk(head, G.hemi, hair, -0.02, 0.03, 0, 0.37, 0.38, 0.36);
    mk(head, G.capsule, hair, -0.18, -0.12, 0, 0.17, 0.14, 0.3);
    mk(head, G.sphere, hair, -0.36, 0.06, 0, 0.12, 0.12, 0.12);
    mk(head, G.capsule, hair, -0.44, -0.18, 0, 0.07, 0.14, 0.07).rotation.z = 0.2;
  }

  // Arme: Schulter -> Ellbogen -> Hand; [0] = rechts (+Z)
  // Arm als ein Stück: kurzer Ärmel oben, Haut darunter, weich gebogen am Ellbogen
  const armGeo = limbGeometry(UPPER, LOWER - 0.06, 0.11, 0.09, 0.085, 0.2);
  const arms = [shoulderW, -shoulderW].map((z) => {
    const shoulder = new THREE.Bone();
    shoulder.position.set(0, 0.52, z);
    shoulder.userData.rest = shoulder.position.clone();
    const elbow = new THREE.Bone();
    elbow.position.y = -UPPER;
    shoulder.add(elbow);
    const limb = skinnedLimb(armGeo, [shirtMat, forearm], shoulder, elbow);
    limb.mesh.add(shoulder);
    torso.add(limb.mesh);
    binds.push(limb.bind);
    mk(elbow, G.sphere, handMat, 0, -LOWER, 0, 0.115, 0.12, 0.11); // große, runde Hand
    if (astro) {
      mk(shoulder, G.ring, orange, 0, -0.15, 0, 0.112, 0.112, 0.112).rotation.x = Math.PI / 2;
      mk(elbow, G.cyl, glove, 0, -0.23, 0, 0.1, 0.07, 0.1); // Handschuh-Stulpe
    } else if (skel) {
      mk(shoulder, G.box, bone, 0.105, -0.18, 0, 0.03, 0.26, 0.05); // Oberarmknochen
      for (const dz of [0.022, -0.022]) mk(elbow, G.box, bone, 0.088, -0.13, dz * 1.2, 0.025, 0.22, 0.025); // Elle und Speiche
      mk(elbow, G.box, bone, 0.11, -LOWER, 0, 0.03, 0.09, 0.07); // Fingerknochen
    } else if (jog) {
      mk(shoulder, G.ring, shirtDark, 0, -0.19, 0, 0.108, 0.108, 0.108).rotation.x = Math.PI / 2; // Ärmelbündchen
      mk(elbow, G.cyl, white, 0, -0.22, 0, 0.098, 0.07, 0.098); // Schweißband
    } else if (office) {
      mk(shoulder, G.ring, shirtMat, 0, -0.2, 0, 0.108, 0.108, 0.108).rotation.x = Math.PI / 2; // hochgekrempelter Ärmel
      if (z < 0) mk(elbow, G.box, toon(0x1b1a1f), 0, -0.24, 0, 0.12, 0.055, 0.12); // Uhr
    }
    return { shoulder, elbow };
  });
  // Skelette in der Ruhepose binden
  body.updateMatrixWorld(true);
  binds.forEach((b) => b());

  const gunPivot = new THREE.Group();
  const gunKick = new THREE.Group();
  gunPivot.add(gunKick);
  body.add(gunPivot);
  return { body, torso, pelvis, head, legs, arms, gunPivot, gunKick, shirtMat, mats: [shirtMat, shirtDark] };
}

interface ArmPose { r: [number, number, number]; l: [number, number, number]; gun: [number, number, number]; gunRot: [number, number] }
// Schulter rotation.z, rotation.x, Ellbogen rotation.z; Waffenposition; Waffenrotation [y, z]
const POSES: Record<string, ArmPose> = {
  aim2: { r: [1.2, 0.3, 0.35], l: [1.12, -0.85, 0.55], gun: [0.2, 1.43, 0.1], gunRot: [0, 0] },
  carry2: { r: [0.35, 0.12, 1.05], l: [0.75, -0.55, 1.1], gun: [0.3, 1.14, 0.14], gunRot: [0.3, -0.25] },
  aim1: { r: [1.5, 0.12, 0.05], l: [0, 0, 0.25], gun: [0.5, 1.44, 0.04], gunRot: [0, 0] },
  carry1: { r: [0.12, 0, 0.45], l: [0, 0, 0.3], gun: [0.2, 0.95, 0.42], gunRot: [0, -1.2] },
  // Raketenwerfer auf der Schulter
  aimRocket: { r: [1.0, 0.45, 1.6], l: [1.05, -0.8, 0.9], gun: [-0.05, 1.7, 0.2], gunRot: [0, 0] },
  carryRocket: { r: [0.9, 0.45, 1.8], l: [0.5, -0.3, 0.8], gun: [-0.05, 1.66, 0.26], gunRot: [0, 0.18] },
  // Minigun an der Hüfte, beide Hände unten
  aimMinigun: { r: [0.6, 0.25, 0.7], l: [0.75, -0.6, 0.95], gun: [0.28, 1.02, 0.08], gunRot: [0, 0] },
  carryMinigun: { r: [0.45, 0.25, 0.8], l: [0.6, -0.55, 1.0], gun: [0.22, 0.98, 0.08], gunRot: [0.25, 0.12] },
  // Fäuste: Deckung beim Kämpfen, sonst freie Arme
  aimFists: { r: [0.95, 0.4, 1.95], l: [0.9, -0.4, 2.0], gun: [0, 1, 0], gunRot: [0, 0] },
  carryFists: { r: [0, 0, 0.35], l: [0, 0, 0.35], gun: [0, 1, 0], gunRot: [0, 0] },
};

export interface AnimState {
  phase: number;
  /** 0 = steht, 1 = läuft normal */
  amp: number;
  aim: number;
  twoHanded: boolean;
  /** Waffen-Id für eigene Haltungen (Raketenwerfer, Minigun) */
  weapon?: string;
  /** Schlag mit den Fäusten: 1 = gerade ausgeholt, fällt auf 0 */
  punch?: number;
  punchArm?: 0 | 1;
  reload: number;
  time: number;
  falling: boolean;
  /** Freifall vor dem Öffnen des Schirms: Bauchlage mit ausgebreiteten Armen und Beinen */
  freefall?: boolean;
  /** Fortschritt des Freifalls 0..1 (anfangs steiler Sturzflug, dann flacher) */
  freeK?: number;
  /** Fahrtwind in der Luft: Bewegung nach vorne / zur Seite (-1..1, relativ zur Figur) */
  legFwd?: number;
  legSide?: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Armlängen: Schulter→Ellbogen und Ellbogen→Hand */
const UPPER = 0.36, LOWER = 0.33;
/** Griffpunkte in Waffen-Koordinaten (rechte Hand am Griff, linke vorne) */
const GRIPS: Record<string, { r: [number, number, number]; l: [number, number, number] | null }> = {
  pistol: { r: [0.02, -0.12, 0], l: [0.0, -0.14, -0.06] },
  smg: { r: [0.02, -0.12, 0], l: [0.3, -0.12, 0] },
  shotgun: { r: [0.02, -0.12, 0], l: [0.55, -0.06, 0] },
  rifle: { r: [0.0, -0.12, 0], l: [0.42, -0.06, 0] },
  sniper: { r: [-0.06, -0.14, 0], l: [0.5, -0.06, 0] },
  minigun: { r: [-0.12, 0.17, 0.05], l: [0.12, 0.17, -0.05] },
  rocket: { r: [0.06, -0.14, 0], l: [0.5, -0.06, 0] },
};
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Zwei-Knochen-IK: Hand an einen Punkt (in Torso-Koordinaten) setzen, Ellbogen zeigt nach außen-unten */
function reach(arm: { shoulder: THREE.Object3D; elbow: THREE.Object3D }, target: THREE.Vector3, side: number, sway = 0) {
  const sp = arm.shoulder.position;
  _v.subVectors(target, sp);
  let d = _v.length();
  d = Math.min(Math.max(d, 0.12), UPPER + LOWER - 0.002);
  const dir = _v.normalize();
  const cosA = (UPPER * UPPER + d * d - LOWER * LOWER) / (2 * UPPER * d);
  const a = Math.acos(Math.min(1, Math.max(-1, cosA)));
  // Ellbogen-Richtung: nach unten und zur Körperseite
  const pole = _e.set(-0.2 + sway * 0.3, -1, side * (0.9 + sway * 0.25)).normalize();
  const perp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  const elbowPos = sp.clone().add(dir.clone().multiplyScalar(UPPER * Math.cos(a))).add(perp.multiplyScalar(UPPER * Math.sin(a)));
  // Oberarm ausrichten
  _t.subVectors(elbowPos, sp).normalize();
  arm.shoulder.quaternion.setFromUnitVectors(DOWN, _t);
  // Unterarm (im Schulter-System) zur Hand ausrichten
  const handPos = sp.clone().add(dir.multiplyScalar(d));
  _t.subVectors(handPos, elbowPos).normalize().applyQuaternion(_q.copy(arm.shoulder.quaternion).invert());
  arm.elbow.quaternion.setFromUnitVectors(DOWN, _t);
}

/** Griffpunkt der Waffe in Torso-Koordinaten */
function gripInTorso(rig: Rig, local: [number, number, number], out: THREE.Vector3) {
  out.set(local[0], local[1], local[2]);
  rig.gunKick.updateMatrix();
  rig.gunPivot.updateMatrix();
  rig.torso.updateMatrix();
  out.applyMatrix4(rig.gunKick.matrix).applyMatrix4(rig.gunPivot.matrix);
  out.applyMatrix4(_m.copy(rig.torso.matrix).invert());
  return out;
}

/** Schultern: Ruheposition plus kleine Verschiebung (vor/zurück, hoch/runter) */
function shoulders(rig: Rig, fwdR = 0, fwdL = 0, upR = 0, upL = 0) {
  rig.arms.forEach((a, i) => {
    const r = a.shoulder.userData.rest as THREE.Vector3 | undefined;
    if (r) a.shoulder.position.set(r.x + (i ? fwdL : fwdR), r.y + (i ? upL : upR), r.z);
  });
}

/** Gehen mit Knie- und Ellbogenbeugung, Hüftwippen und Gegendrehung des Oberkörpers */
export function animateRig(rig: Rig, s: AnimState) {
  const { phase, amp } = s;
  // Schultern gehen im Schritt mit: die Schulter des vorschwingenden Arms schiebt leicht nach vorne
  const sh = Math.sin(phase + Math.PI - 0.25) * amp;
  shoulders(rig, sh * 0.045, -sh * 0.045, Math.max(0, -sh) * 0.02, Math.max(0, sh) * 0.02);
  rig.body.rotation.z = 0;
  rig.body.rotation.x = 0;
  rig.body.scale.set(1, 1, 1);
  rig.legs.forEach((l) => (l.hip.rotation.x = 0));
  if (s.freefall) {
    // Bauchlage: Körper nach vorn gekippt, Arme und Beine gespreizt, flattert im Wind
    const fl = Math.sin(s.time * 13) * 0.04, fl2 = Math.sin(s.time * 11 + 1) * 0.05;
    const fk = s.freeK ?? 0.5;
    rig.body.rotation.z = -1.45 + fk * 0.4;
    rig.body.position.set(0.8, 0.85, 0);
    rig.torso.rotation.set(0, 0, 0.12);
    rig.pelvis.rotation.set(0, 0, 0);
    shoulders(rig);
    // Beine ruhig gespreizt, nur ganz leichtes Flattern im Wind, seitlich entgegen der Flugrichtung
    const sd = (s.legSide ?? 0) * 0.25;
    rig.legs[0].hip.rotation.set(0.36 + fl2 * 0.25 + sd, 0, -0.15);
    rig.legs[1].hip.rotation.set(-0.36 - fl2 * 0.25 + sd, 0, -0.15);
    rig.legs.forEach((l) => (l.knee.rotation.z = -0.7));
    const ty = rig.torso.position.y;
    reach(rig.arms[0], new THREE.Vector3(0.18, 0.62 - ty + 1.12 + fl, 0.95), 1);
    reach(rig.arms[1], new THREE.Vector3(0.18, 0.62 - ty + 1.12 - fl, -0.95), -1);
    rig.gunPivot.visible = false;
    return;
  }
  if (s.falling) {
    // am Fallschirm: Arme halten die Leinen, Beine baumeln
    // Beine hängen ruhig und wehen entgegen der Flugrichtung (vorwärts -> nach hinten, seitwärts -> zur anderen Seite)
    const fwd = s.legFwd ?? 0, side = s.legSide ?? 0, wob = Math.sin(s.time * 1.7) * 0.025;
    rig.legs[0].hip.rotation.set(side * 0.32 + 0.05, 0, 0.08 - fwd * 0.42 + wob);
    rig.legs[1].hip.rotation.set(side * 0.32 - 0.05, 0, 0.02 - fwd * 0.42 - wob);
    rig.legs.forEach((l, i) => (l.knee.rotation.z = -0.32 - Math.max(0, fwd) * 0.18 - i * 0.06));
    rig.torso.rotation.set(0, 0, 0);
    shoulders(rig);
    // beide Hände greifen die Steuerleinen über dem Kopf (Torso-Koordinaten: Körper minus Torso-Höhe)
    const pull = Math.sin(s.time * 1.3 + phase) * 0.03;
    reach(rig.arms[0], new THREE.Vector3(RISER.x, RISER.y - rig.torso.position.y + pull, RISER.z), 1);
    reach(rig.arms[1], new THREE.Vector3(RISER.x, RISER.y - rig.torso.position.y - pull, -RISER.z), -1);
    rig.pelvis.rotation.set(0, 0, 0);
    rig.body.position.set(0, 0, 0);
    rig.gunPivot.visible = false;
    return;
  }
  rig.gunPivot.visible = true;
  rig.arms.forEach((a) => { a.elbow.rotation.x = 0; a.elbow.rotation.y = 0; a.shoulder.rotation.y = 0; });
  for (let i = 0; i < 2; i++) {
    const p = phase + (i === 0 ? 0 : Math.PI);
    const leg = rig.legs[i];
    leg.hip.rotation.z = Math.sin(p) * 0.62 * amp;
    // Knie beugt sich, wenn das Bein nach vorne schwingt und beim Abdrücken
    leg.knee.rotation.z = -(Math.max(0, Math.cos(p)) * 0.95 + 0.08) * amp;
  }
  const live = ANIM.lively;
  rig.body.position.y = Math.abs(Math.sin(phase)) * (live ? 0.1 : 0.06) * amp - 0.02 * amp;
  if (live) {
    // Stauchen und Strecken im Schritt: beim Aufsetzen etwas breiter, oben etwas länger
    const sq = (Math.abs(Math.sin(phase)) - 0.5) * 0.07 * amp;
    rig.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
  }
  // beim Zielen mit zweihändigen Waffen: Oberkörper seitlich (linke Schulter nach vorne)
  const blade = (s.twoHanded && s.weapon !== 'minigun' ? -0.45 : 0) * s.aim;
  // Oberkörper dreht nur leicht gegen die Beine, wiegt sich minimal zur Seite; Kopf bleibt ruhig
  // Becken dreht mit dem vorschwingenden Bein, Schultern leicht dagegen; kleine Gewichtsverlagerung zur Seite
  rig.pelvis.rotation.set(0, Math.sin(phase) * 0.12 * amp, 0);
  rig.body.position.z = Math.sin(phase) * 0.025 * amp;
  const twist = -Math.sin(phase) * (live ? 0.12 : 0.07) * amp;
  rig.torso.rotation.set(-Math.sin(phase) * (live ? 0.06 : 0.03) * amp, twist + blade, -(live ? 0.09 : 0.05) * amp);
  rig.head.rotation.y -= blade + twist;
  if (!live) rig.head.rotation.z = 0;
  if (live) {
    // Kopf nickt leicht verzögert mit (Nachschwingen), im Stand schaut er sich ein wenig um und verlagert das Gewicht
    rig.head.rotation.z = Math.sin(phase * 2 - 0.7) * 0.07 * amp + Math.sin(s.time * 0.7) * 0.04 * (1 - amp);
    rig.body.position.z += Math.sin(s.time * 1.1) * 0.02 * (1 - amp);
  }
  // Atmen im Stand
  rig.torso.position.y = (rig.torsoY ?? 1.0) + (1 - amp) * Math.sin(s.time * 2.2) * (live ? 0.02 : 0.012);

  const two = s.twoHanded;
  const fists = s.weapon === 'fists';
  const a = fists ? POSES.aimFists : s.weapon === 'rocket' ? POSES.aimRocket : s.weapon === 'minigun' ? POSES.aimMinigun : two ? POSES.aim2 : POSES.aim1;
  const c = fists ? POSES.carryFists : s.weapon === 'rocket' ? POSES.carryRocket : s.weapon === 'minigun' ? POSES.carryMinigun : two ? POSES.carry2 : POSES.carry1;
  const k = s.aim;
  // lockerer Armschwung, leicht verzögert gegenüber den Beinen
  const swingK = live ? 0.56 : 0.4;
  const swingR = -Math.sin(phase + Math.PI - 0.35) * swingK * amp; // rechter Arm gegen rechtes Bein (etwas verzögert)
  const swingL = -Math.sin(phase - 0.35) * swingK * amp;
  const free = (i: 0 | 1) => (i === 0 ? swingR : swingL);
  const set = (i: 0 | 1, carry: [number, number, number], aim: [number, number, number], swingable: boolean) => {
    const arm = rig.arms[i];
    const sw = swingable ? free(i) : 0;
    arm.shoulder.rotation.z = lerp(carry[0] + sw, aim[0], k);
    arm.shoulder.rotation.x = lerp(carry[1], aim[1], k);
    // Ellbogen: beim Vorschwingen deutlich gebeugt, beim Zurückschwingen fast gestreckt
    const bend = swingable ? 0.18 * amp + Math.max(0, sw) * 1.5 : 0;
    arm.elbow.rotation.x = 0;
    arm.elbow.rotation.z = lerp(carry[2] + bend, aim[2], k);
  };
  set(0, c.r, a.r, !two);
  set(1, c.l, a.l, !two);
  if (fists) {
    // beide Arme schwingen frei; beim Schlag schnellt ein Arm gerade nach vorne
    if (k < 0.05) {
      rig.arms[0].shoulder.rotation.z = swingR; rig.arms[1].shoulder.rotation.z = swingL;
      rig.arms[0].elbow.rotation.z = 0.3 + 0.18 * amp + Math.max(0, swingR) * 1.5;
      rig.arms[1].elbow.rotation.z = 0.3 + 0.18 * amp + Math.max(0, swingL) * 1.5;
    }
    const pt = s.punch ?? 0;
    if (pt > 0) {
      const ext = Math.sin(Math.min(1, (1 - pt) * 1.6) * Math.PI); // raus und zurück
      const arm = rig.arms[s.punchArm ?? 0];
      arm.shoulder.rotation.z = lerp(arm.shoulder.rotation.z, 1.55, ext);
      arm.shoulder.rotation.x = lerp(arm.shoulder.rotation.x, 0, ext);
      arm.elbow.rotation.z = lerp(arm.elbow.rotation.z, 0.05, ext);
      rig.torso.rotation.y += (s.punchArm ? -1 : 1) * 0.25 * ext;
    }
  } else if (!two) {
    // freie linke Hand schwingt auch beim Zielen mit der Pistole
    rig.arms[1].shoulder.rotation.z = swingL;
    rig.arms[1].elbow.rotation.z = 0.25 + 0.18 * amp + Math.max(0, swingL) * 1.5;
  }
  rig.gunPivot.position.set(lerp(c.gun[0], a.gun[0], k), lerp(c.gun[1], a.gun[1], k) + rig.body.position.y + (rig.gunDy ?? 0), lerp(c.gun[2], a.gun[2], k));
  rig.gunPivot.rotation.set(0, lerp(c.gunRot[0], a.gunRot[0], k), lerp(c.gunRot[1], a.gunRot[1], k));
  // beim Tragen wippt und pendelt die Waffe im Schritt mit (Arme folgen über IK)
  const carryK = (1 - k) * amp;
  if (carryK > 0.01 && !fists) {
    rig.gunPivot.position.x += Math.sin(phase) * 0.035 * carryK;
    rig.gunPivot.position.y += Math.abs(Math.cos(phase)) * 0.045 * carryK;
    rig.gunPivot.position.z += Math.sin(phase) * 0.03 * carryK;
    rig.gunPivot.rotation.y += Math.sin(phase) * 0.12 * carryK;
    rig.gunPivot.rotation.x = Math.sin(phase) * 0.08 * carryK;
  }
  if (s.reload > 0.01) {
    rig.gunPivot.rotation.z -= 0.75 * s.reload;
    rig.gunPivot.rotation.x = Math.sin(s.time * 14) * 0.15 * s.reload;
    rig.gunPivot.position.y -= 0.18 * s.reload;
    rig.arms[1].shoulder.rotation.z = lerp(rig.arms[1].shoulder.rotation.z, 0.9, s.reload);
    rig.arms[1].elbow.rotation.z = lerp(rig.arms[1].elbow.rotation.z, 1.2, s.reload);
  } else if (!(carryK > 0.01 && !fists)) {
    rig.gunPivot.rotation.x = 0;
  }
  // Hände an die Waffe setzen (rechts immer am Griff, links vorne bzw. beim Pistolenanschlag)
  const g = s.weapon ? GRIPS[s.weapon] : undefined;
  if (g) {
    const sw = Math.sin(phase) * carryK;
    reach(rig.arms[0], gripInTorso(rig, g.r, new THREE.Vector3()), 1, sw);
    const leftOn = g.l && (two || k > 0.5) && s.reload < 0.5;
    if (leftOn) reach(rig.arms[1], gripInTorso(rig, g.l!, new THREE.Vector3()), -1, -sw);
    else if (s.reload >= 0.5) reach(rig.arms[1], gripInTorso(rig, [0.18, -0.32, 0], new THREE.Vector3()), -1);
  }
}

/** niedergeschlagen: auf Händen und Knien krabbeln (diagonaler Gang) */
export function poseCrawl(rig: Rig, t: number, moving: number) {
  rig.body.scale.set(1, 1, 1);
  rig.gunPivot.visible = false;
  shoulders(rig);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.body.position.z = 0;
  const m = moving;
  const c = Math.sin(t), c2 = Math.sin(t + Math.PI);
  // Becken tief, Oberschenkel senkrecht, Unterschenkel liegen nach hinten auf dem Boden
  rig.body.position.y = -0.42 * (rig.hipK ?? 1) + Math.abs(Math.sin(t)) * 0.03 * m;
  rig.legs[0].hip.rotation.set(0, 0, 0.12 + c * 0.28 * m);
  rig.legs[1].hip.rotation.set(0, 0, 0.12 + c2 * 0.28 * m);
  rig.legs[0].knee.rotation.z = -1.5 - c * 0.15 * m;
  rig.legs[1].knee.rotation.z = -1.5 - c2 * 0.15 * m;
  // Oberkörper waagerecht nach vorne, leicht nach oben
  rig.torso.rotation.set(Math.sin(t * 2) * 0.04 * m, 0, -1.25);
  // Arme stützen sich senkrecht ab, diagonal zu den Beinen versetzt
  rig.arms[0].shoulder.rotation.set(0, 0, 1.25 + c2 * 0.3 * m);
  rig.arms[1].shoulder.rotation.set(0, 0, 1.25 + c * 0.3 * m);
  rig.arms[0].elbow.rotation.set(0, 0, 0.15 + Math.max(0, c2) * 0.35 * m);
  rig.arms[1].elbow.rotation.set(0, 0, 0.15 + Math.max(0, c) * 0.35 * m);
  // Kopf hebt sich und schaut nach vorne
  rig.head.rotation.z = 1.0;
  rig.head.rotation.x = 0;
}

/** Momentaufnahme aller Gelenke, damit das Sterben aus der aktuellen Haltung heraus beginnt */
export type PoseSnap = number[];
const V3 = 3;
function joints(rig: Rig): THREE.Object3D[] {
  return [rig.body, rig.torso, rig.pelvis, rig.head, rig.legs[0].hip, rig.legs[1].hip, rig.legs[0].knee, rig.legs[1].knee,
    rig.arms[0].shoulder, rig.arms[1].shoulder, rig.arms[0].elbow, rig.arms[1].elbow];
}
export function capturePose(rig: Rig): PoseSnap {
  rig.body.rotation.order = 'YXZ';
  const out: number[] = [];
  for (const j of joints(rig)) out.push(j.rotation.x, j.rotation.y, j.rotation.z);
  out.push(rig.body.position.x, rig.body.position.y, rig.body.position.z);
  return out;
}
function applyPose(rig: Rig, p: PoseSnap) {
  joints(rig).forEach((j, i) => j.rotation.set(p[i * V3], p[i * V3 + 1], p[i * V3 + 2]));
  const o = joints(rig).length * V3;
  rig.body.position.set(p[o], p[o + 1], p[o + 2]);
}
const mix = (a: PoseSnap, b: PoseSnap, k: number) => a.map((v, i) => v + (b[i] - v) * k);

/** Gelenk-Zielwerte: body [rx, ry, rz], torso, pelvis, head, Hüfte r/l, Knie r/l, Schulter r/l, Ellbogen r/l, body-Position */
type PoseDef = { body?: number[]; torso?: number[]; head?: number[]; hip?: number[][]; knee?: number[]; sh?: number[][]; el?: number[]; pos?: number[] };
function build(base: PoseSnap, d: PoseDef): PoseSnap {
  const p = base.slice();
  const set = (idx: number, v?: number[]) => { if (v) for (let k = 0; k < 3; k++) if (v[k] !== undefined && !Number.isNaN(v[k])) p[idx * V3 + k] = v[k]; };
  set(0, d.body); set(1, d.torso); p[2 * V3] = p[2 * V3 + 1] = p[2 * V3 + 2] = 0; set(3, d.head);
  if (d.hip) { set(4, d.hip[0]); set(5, d.hip[1]); }
  if (d.knee) { p[6 * V3 + 2] = d.knee[0]; p[7 * V3 + 2] = d.knee[1]; p[6 * V3] = p[6 * V3 + 1] = p[7 * V3] = p[7 * V3 + 1] = 0; }
  if (d.sh) { set(8, d.sh[0]); set(9, d.sh[1]); }
  if (d.el) { p[10 * V3 + 2] = d.el[0]; p[11 * V3 + 2] = d.el[1]; p[10 * V3] = p[10 * V3 + 1] = p[11 * V3] = p[11 * V3 + 1] = 0; }
  if (d.pos) { const o = 12 * V3; p[o] = d.pos[0]; p[o + 1] = d.pos[1]; p[o + 2] = d.pos[2]; }
  return p;
}
const N = NaN;

export type DeathKind = 'back' | 'front' | 'left' | 'right' | 'down';

/**
 * Sterben aus der aktuellen Haltung: im Stehen knicken die Knie ein, der Körper dreht sich leicht und
 * kippt mit zunehmender Geschwindigkeit (nach hinten, vorne oder zur Seite), prallt auf und die Glieder sacken nach.
 * Wer niedergeschlagen kriecht, bricht ein und rollt leicht auf die Seite.
 */
export function poseDeath(rig: Rig, snap: PoseSnap, kind: DeathKind, t: number, seed: number) {
  rig.body.scale.set(1, 1, 1);
  rig.gunPivot.visible = false;
  shoulders(rig);
  const yaw = snap[1];
  const tw = ((seed % 7) / 7 - 0.5) * 0.9; // leichte Drehung beim Fallen
  const rnd = ((seed * 37) % 11) / 11 - 0.5;
  const sideS = kind === 'left' ? 1 : -1;
  let fin: PoseSnap, buckle: PoseSnap | null = null, midP: PoseSnap | null = null;
  if (kind === 'down') {
    fin = build(snap, { body: [0.45 + rnd * 0.3, yaw + tw * 0.5, -1.5], torso: [0, 0, 0.05], head: [0.7, 0, 0.1], hip: [[0, 0, 0.1], [0, 0, 0.4]], knee: [-0.25, -0.9], sh: [[0, 0, 2.6], [0.3, 0, 0.35]], el: [0.35, 1.1], pos: [0.2, 0.2, 0] });
    midP = build(snap, { body: [0.1, yaw, -1.2], torso: [0, 0, -0.5], head: [0, 0, 0.5], sh: [[0, 0, 1.9], [0, 0, 0.9]], el: [0.9, 0.9], pos: [0.1, -0.15, 0] });
  } else {
    const fall: number[] = kind === 'back' ? [rnd * 0.25, yaw + tw, 1.5] : kind === 'front' ? [rnd * 0.25, yaw + tw, -1.5] : [sideS * 1.45, yaw + tw, 0.25 * rnd];
    const lean: number[] = kind === 'back' ? [0, yaw + tw * 0.3, 0.22] : kind === 'front' ? [0, yaw + tw * 0.3, -0.3] : [sideS * 0.25, yaw + tw * 0.3, 0];
    buckle = build(snap, { body: lean, torso: [0, 0, kind === 'back' ? 0.15 : -0.3], head: [0, 0, kind === 'back' ? 0.35 : -0.35], hip: [[0, 0, 0.5], [0, 0, 0.35]], knee: [-0.9, -0.7], sh: [[0.2, 0, 0.5], [-0.2, 0, 0.35]], el: [0.6, 0.5], pos: [0, -0.32, 0] });
    midP = build(snap, { body: fall.map((v, i) => (i === 1 ? v : v * 0.55)), torso: [0, 0, kind === 'front' ? -0.25 : 0.2], head: [0, 0, kind === 'front' ? -0.5 : 0.5], hip: [[0, 0, 0.7], [0, 0, 0.3]], knee: [-1.15, -0.8], sh: [[0.7, 0, 1.9], [-0.7, 0, 1.6]], el: [0.4, 0.6], pos: [0, -0.42, 0] });
    if (kind === 'back') fin = build(snap, { body: fall, torso: [0, 0, 0.1], head: [rnd * 0.8, 0, 0.25], hip: [[0.15, 0, 0.35], [-0.1, 0, 0.1]], knee: [-0.65, -0.25], sh: [[0.4, 0, 2.2], [-0.5, 0, 1.55]], el: [0.7, 0.3], pos: [0, 0.12, 0] });
    else if (kind === 'front') fin = build(snap, { body: fall, torso: [0, 0, -0.05], head: [0.65, 0, -0.1], hip: [[0, 0, -0.1], [0, 0, 0.25]], knee: [-0.3, -0.75], sh: [[0.6, 0, 0.9], [-0.9, 0, 0.35]], el: [0.9, 0.4], pos: [0, 0.18, 0] });
    else fin = build(snap, { body: fall, torso: [0, 0, -0.15], head: [sideS * 0.3, 0, 0], hip: [[0, 0, 0.65], [0, 0, 0.2]], knee: [-1.05, -0.4], sh: [[0, 0, 0.8], [0, 0, 2.0]], el: [1.0, 0.4], pos: [0, 0.22, 0] });
  }
  void N;
  let p: PoseSnap;
  if (buckle) {
    const A = 0.2, B = 0.55, C = 0.82;
    if (t < A) { const k = t / A; p = mix(snap, buckle, 1 - (1 - k) * (1 - k)); }
    else if (t < B) { const k = (t - A) / (B - A); p = mix(buckle, midP!, k * k); }
    else if (t < C) { const k = (t - B) / (C - B); p = mix(midP!, fin, k * k); }
    else p = fin.slice();
    // Aufprall: kurz zurückfedern, Kopf schlägt nach
    const im = t - C;
    if (im > 0) {
      const bo = Math.sin(im * 22) * 0.07 * Math.exp(-im * 8);
      if (kind === 'left' || kind === 'right') p[0] -= Math.sign(p[0]) * Math.abs(bo); else p[2] -= Math.sign(p[2]) * Math.abs(bo);
      p[3 * V3 + 2] += bo * 2;
    }
  } else {
    const A = 0.25, B = 0.6;
    if (t < A) { const k = t / A; p = mix(snap, midP!, k * k); }
    else if (t < B) { const k = (t - A) / (B - A); p = mix(midP!, fin, 1 - (1 - k) * (1 - k)); }
    else p = fin.slice();
    const im = t - B;
    if (im > 0) p[2] -= Math.sin(im * 18) * 0.05 * Math.exp(-im * 8);
  }
  applyPose(rig, p);
}

export function poseLying(rig: Rig, t: number, crawl: boolean) {
  shoulders(rig);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.body.position.z = 0;
  rig.head.rotation.z = 0;
  rig.head.rotation.x = 0;
  rig.legs.forEach((l) => l.hip.rotation.set(0, 0, 0));
  rig.arms.forEach((a) => a.elbow.rotation.set(0, 0, 0));
  rig.body.position.y = 0;
  rig.gunPivot.visible = false;
  const c = crawl ? Math.sin(t) : 0;
  rig.legs[0].hip.rotation.z = 0.2 + c * 0.4;
  rig.legs[1].hip.rotation.z = 0.2 - c * 0.4;
  rig.legs.forEach((l, i) => (l.knee.rotation.z = -0.4 - (i ? -c : c) * 0.3));
  rig.arms[0].shoulder.rotation.set(0, 0, 2.5 + c * 0.4);
  rig.arms[1].shoulder.rotation.set(0, 0, 2.4 - c * 0.4);
  rig.arms.forEach((a) => (a.elbow.rotation.z = 0.5));
  rig.torso.rotation.set(0, 0, 0);
}

const hexs = (c: number) => '#' + c.toString(16).padStart(6, '0');

function drawLogo(c: CanvasRenderingContext2D, logo: string, x: number, y: number, r: number, col: string) {
  c.save();
  c.translate(x, y);
  c.fillStyle = col;
  c.strokeStyle = col;
  c.beginPath();
  if (logo === 'star') {
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.fill();
  } else if (logo === 'heart') {
    c.moveTo(0, r * 0.9);
    c.bezierCurveTo(-r * 1.3, -r * 0.1, -r * 0.6, -r * 1.1, 0, -r * 0.45);
    c.bezierCurveTo(r * 0.6, -r * 1.1, r * 1.3, -r * 0.1, 0, r * 0.9);
    c.fill();
  } else if (logo === 'bolt') {
    const pts = [[0.2, -1], [-0.55, 0.12], [-0.05, 0.12], [-0.25, 1], [0.55, -0.15], [0.05, -0.15]];
    pts.forEach(([px, py], i) => (i ? c.lineTo(px * r, py * r) : c.moveTo(px * r, py * r)));
    c.closePath(); c.fill();
  } else if (logo === 'skull') {
    c.arc(0, -r * 0.15, r * 0.75, 0, Math.PI * 2); c.fill();
    c.fillRect(-r * 0.45, r * 0.35, r * 0.9, r * 0.45);
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(-r * 0.3, -r * 0.2, r * 0.2, 0, Math.PI * 2); c.arc(r * 0.3, -r * 0.2, r * 0.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); for (const dx of [-0.25, 0, 0.25]) c.rect(dx * r - r * 0.04, r * 0.4, r * 0.08, r * 0.35); c.fill();
  } else if (logo === 'crown') {
    const pts = [[-1, 0.6], [-1, -0.5], [-0.5, 0.05], [0, -0.75], [0.5, 0.05], [1, -0.5], [1, 0.6]];
    pts.forEach(([px, py], i) => (i ? c.lineTo(px * r, py * r) : c.moveTo(px * r, py * r)));
    c.closePath(); c.fill();
  }
  c.restore();
}

/** Schirmstoff: Bahnen in Haupt-/Streifenfarbe, Logo und Text */
/** Grundmuster des Schirms (u = rundherum, v = von der Spitze zum Saum) */
function drawPattern(c: CanvasRenderingContext2D, d: ChuteDesign, cells: number) {
  const A = hexs(d.color), B = hexs(d.accent), W = 1024, H = 256;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  c.fillStyle = A; c.fillRect(0, 0, W, H);
  switch (d.pattern ?? 'bahnen') {
    case 'bahnen':
      for (let i = 0; i < cells; i++) { c.fillStyle = i % 2 === 0 ? A : B; c.fillRect((i / cells) * W, 0, W / cells + 1, H); }
      break;
    case 'uni':
      c.fillStyle = B; c.fillRect(0, H - 46, W, 22);
      break;
    case 'ringe':
      for (let k = 0; k < 4; k++) { c.fillStyle = B; c.fillRect(0, 30 + k * 56, W, 24); }
      break;
    case 'karo':
      for (let i = 0; i < cells * 2; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) { c.fillStyle = B; c.fillRect((i / (cells * 2)) * W, j * 64, W / (cells * 2) + 1, 64); }
      break;
    case 'punkte':
      c.fillStyle = B;
      for (let j = 0; j < 4; j++) for (let i = 0; i < cells * 2; i++) { c.beginPath(); c.arc(((i + (j % 2) * 0.5) / (cells * 2)) * W, 34 + j * 60, 15, 0, Math.PI * 2); c.fill(); }
      break;
    case 'zickzack':
      c.fillStyle = B;
      for (const y0 of [70, 170]) {
        c.beginPath(); c.moveTo(0, y0);
        for (let i = 0; i <= cells * 3; i++) c.lineTo((i / (cells * 3)) * W, y0 + (i % 2 ? -26 : 26));
        for (let i = cells * 3; i >= 0; i--) c.lineTo((i / (cells * 3)) * W, y0 + 26 + (i % 2 ? -26 : 26));
        c.closePath(); c.fill();
      }
      break;
    case 'verlauf': {
      const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, A); gr.addColorStop(1, B);
      c.fillStyle = gr; c.fillRect(0, 0, W, H);
      break;
    }
    case 'flammen':
      c.fillStyle = B;
      c.beginPath(); c.moveTo(0, H);
      for (let i = 0; i <= cells * 2; i++) {
        const x = (i / (cells * 2)) * W, tall = 90 + rnd() * 90;
        c.quadraticCurveTo(x - W / (cells * 4), H - tall * 0.4, x, H - tall);
        c.quadraticCurveTo(x + W / (cells * 8), H - tall * 0.5, x + W / (cells * 4), H - 30);
      }
      c.lineTo(W, H); c.closePath(); c.fill();
      break;
    case 'tarn':
      for (let i = 0; i < 70; i++) {
        c.fillStyle = i % 3 === 0 ? 'rgba(0,0,0,0.25)' : B;
        const x = rnd() * W, y = rnd() * H, r = 18 + rnd() * 30;
        c.beginPath(); c.ellipse(x, y, r * 1.6, r, rnd() * 3, 0, Math.PI * 2); c.fill();
      }
      break;
    case 'sterne':
      c.fillStyle = B;
      for (let i = 0; i < 60; i++) { const x = rnd() * W, y = rnd() * H * 0.9, r = 3 + rnd() * 7; drawLogo(c, 'star', x, y, r, B); }
      break;
  }
}

function chuteTexture(d: ChuteDesign, cells: number, copies: number) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 256;
  const c = cv.getContext('2d')!;
  drawPattern(c, d, cells);
  c.fillStyle = 'rgba(0,0,0,0.1)';
  c.fillRect(0, 232, 1024, 24);
  // Kontrastfarbe für Logo und Text
  const lum = (n: number) => ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
  const ink = d.logo !== 'none' && d.accent !== d.color && Math.abs(lum(d.accent) - lum(d.color)) > 60 ? hexs(d.accent) : lum(d.color) > 140 ? '#22252b' : '#ffffff';
  for (let k = 0; k < copies; k++) {
    const cx = ((k + 0.5) / copies) * 1024;
    // Fläche unter Logo/Text in Hauptfarbe, damit beides lesbar bleibt
    if (d.logo !== 'none' || d.text) { c.fillStyle = hexs(d.color); c.fillRect(cx - 130, 70, 260, 160); }
    if (d.logo !== 'none') drawLogo(c, d.logo, cx, 120, 44, ink);
    if (d.text) {
      c.fillStyle = ink;
      c.font = '900 44px Nunito, Arial Black, Arial, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(d.text.slice(0, 12).toUpperCase(), cx, d.logo !== 'none' ? 198 : 150, 250);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Punkte, an denen die Hände die Steuerleinen halten (Körper-Koordinaten) */
export const RISER = { y: 2.12, z: 0.33, x: 0.02 };

/** Fallschirm: Rundkappe oder moderner Gleitschirm */
export function buildChute(kind: ChuteKind, design: ChuteDesign = WHITE_CHUTE, gradient: THREE.Texture, lineMat: THREE.Material, harnessY = RISER.y) {
  const chute = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const tex = chuteTexture(design, kind === 'round' ? 12 : 8, kind === 'round' ? 2 : 1);
  const mat = new THREE.MeshToonMaterial({ map: tex, gradientMap: gradient, side: THREE.DoubleSide });
  disposables.push(tex, mat);
  const pts: number[] = [];
  if (kind === 'round') {
    const size = 2.3;
    const geo = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.4);
    disposables.push(geo);
    const canopy = new THREE.Mesh(geo, mat);
    canopy.scale.set(size, size * 0.55, size);
    canopy.position.y = harnessY + size * 1.25;
    canopy.castShadow = true;
    chute.add(canopy);
    const rimR = size * Math.sin(Math.PI * 0.4), rimY = canopy.position.y + size * 0.55 * Math.cos(Math.PI * 0.4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      // Leinen laufen zur Hand auf der jeweiligen Seite
      const side = Math.sin(a) >= 0 ? 1 : -1;
      pts.push(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR, RISER.x, harnessY, side * RISER.z);
    }
  } else {
    // Gleitschirm: gewölbter Flügel quer zur Flugrichtung
    const span = 1.15, R = 3.0, depth = 1.7;
    const geo = new THREE.CylinderGeometry(R, R, depth, 20, 1, true, -span / 2, span);
    // Bogen nach oben, Achse in Flugrichtung (+X)
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(Math.PI / 2);
    disposables.push(geo);
    const canopy = new THREE.Mesh(geo, mat);
    canopy.position.y = harnessY + 3.6 - R;
    canopy.castShadow = true;
    chute.add(canopy);
    // Leinen von der Vorder- und Hinterkante zum Gurt
    for (let i = 0; i <= 4; i++) {
      const a = -span / 2 + (i / 4) * span;
      const y = canopy.position.y + Math.cos(a) * R, z = Math.sin(a) * R;
      const side = z >= 0 ? 1 : -1;
      pts.push(depth / 2 - 0.2, y, z, RISER.x, harnessY, side * RISER.z, -depth / 2 + 0.2, y, z, RISER.x, harnessY, side * RISER.z);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  disposables.push(lg);
  chute.add(new THREE.LineSegments(lg, lineMat));
  return { chute, disposables };
}

/** Skelett mit Plüsch-Teilen: gleiche Knochen-Struktur wie die normalen Figuren, nur andere Gelenk-Positionen */
function buildPlush(pd: NonNullable<ReturnType<typeof plushData>>, toon: (c: number) => THREE.MeshToonMaterial): Rig {
  const body = new THREE.Group();
  const pelvis = new THREE.Group();
  body.add(pelvis);
  const legs = [pd.legZ, -pd.legZ].map((z) => {
    const hip = new THREE.Bone();
    hip.position.set(0, pd.hipY, z);
    const knee = new THREE.Bone();
    knee.position.y = -pd.hipY * 0.5;
    hip.add(knee);
    pelvis.add(hip);
    return { hip, knee };
  });
  const torso = new THREE.Group();
  torso.position.y = pd.torsoY;
  body.add(torso);
  const head = new THREE.Group();
  head.position.y = pd.headY;
  torso.add(head);
  const arms = pd.shoulder.map((sh) => {
    const shoulder = new THREE.Bone();
    shoulder.position.set(sh.x, sh.y, sh.z);
    shoulder.userData.rest = shoulder.position.clone();
    const elbow = new THREE.Bone();
    elbow.position.y = -UPPER;
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  });
  // Hauptfarbe (meiste Fläche) bekommt ein eigenes Material, damit sie bei Treffern aufblitzen kann
  const area = new Map<string, number>();
  for (const p of pd.parts) area.set(p.color.getHexString(), (area.get(p.color.getHexString()) ?? 0) + p.geo.getAttribute('position').count);
  const mainHex = [...area.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const shirtMat = toon(parseInt(mainHex, 16)).clone();
  const target: Record<string, THREE.Object3D> = {
    head, torso, pelvis, legR: legs[0].hip, legL: legs[1].hip, upR: arms[0].shoulder, upL: arms[1].shoulder, loR: arms[0].elbow, loL: arms[1].elbow,
  };
  for (const p of pd.parts) {
    const hexs = p.color.getHexString();
    const m = new THREE.Mesh(p.geo, hexs === mainHex ? shirtMat : toon(p.color.getHex()));
    m.castShadow = true;
    target[p.bone].add(m);
  }
  const gunPivot = new THREE.Group();
  const gunKick = new THREE.Group();
  gunPivot.add(gunKick);
  body.add(gunPivot);
  return { body, torso, pelvis, head, legs, arms, gunPivot, gunKick, shirtMat, mats: [shirtMat], torsoY: pd.torsoY, gunDy: pd.torsoY - 1.0, hipK: pd.hipY / 0.9 };
}
