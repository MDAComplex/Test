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
}

export type CharKind = 'man' | 'woman';
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
  const { kind, toon } = opts;
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
  rig.legs.forEach((l) => (l.hip.rotation.x = 0));
  if (s.freefall) {
    // Bauchlage: Körper nach vorn gekippt, Arme und Beine gespreizt, flattert im Wind
    const fl = Math.sin(s.time * 13) * 0.04, fl2 = Math.sin(s.time * 11 + 1) * 0.05;
    rig.body.rotation.z = -1.3;
    rig.body.position.set(0.85, 0.9, 0);
    rig.torso.rotation.set(0, 0, 0.12);
    rig.pelvis.rotation.set(0, 0, 0);
    shoulders(rig);
    rig.legs[0].hip.rotation.set(0.38 + fl2, 0, -0.15);
    rig.legs[1].hip.rotation.set(-0.38 - fl2, 0, -0.15);
    rig.legs.forEach((l) => (l.knee.rotation.z = -0.7));
    const ty = rig.torso.position.y;
    reach(rig.arms[0], new THREE.Vector3(0.18, 0.62 - ty + 1.12 + fl, 0.95), 1);
    reach(rig.arms[1], new THREE.Vector3(0.18, 0.62 - ty + 1.12 - fl, -0.95), -1);
    rig.gunPivot.visible = false;
    return;
  }
  if (s.falling) {
    // am Fallschirm: Arme halten die Leinen, Beine baumeln
    const sway = Math.sin(s.time * 2.4 + phase);
    rig.legs[0].hip.rotation.z = 0.15 + sway * 0.12;
    rig.legs[1].hip.rotation.z = -0.05 - sway * 0.12;
    rig.legs.forEach((l) => (l.knee.rotation.z = -0.35));
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
  rig.body.position.y = Math.abs(Math.sin(phase)) * 0.06 * amp - 0.02 * amp;
  // beim Zielen mit zweihändigen Waffen: Oberkörper seitlich (linke Schulter nach vorne)
  const blade = (s.twoHanded && s.weapon !== 'minigun' ? -0.45 : 0) * s.aim;
  // Oberkörper dreht nur leicht gegen die Beine, wiegt sich minimal zur Seite; Kopf bleibt ruhig
  // Becken dreht mit dem vorschwingenden Bein, Schultern leicht dagegen; kleine Gewichtsverlagerung zur Seite
  rig.pelvis.rotation.set(0, Math.sin(phase) * 0.12 * amp, 0);
  rig.body.position.z = Math.sin(phase) * 0.025 * amp;
  const twist = -Math.sin(phase) * 0.07 * amp;
  rig.torso.rotation.set(-Math.sin(phase) * 0.03 * amp, twist + blade, -0.05 * amp);
  rig.head.rotation.y -= blade + twist;
  // Atmen im Stand
  rig.torso.position.y = 1.0 + (1 - amp) * Math.sin(s.time * 2.2) * 0.012;

  const two = s.twoHanded;
  const fists = s.weapon === 'fists';
  const a = fists ? POSES.aimFists : s.weapon === 'rocket' ? POSES.aimRocket : s.weapon === 'minigun' ? POSES.aimMinigun : two ? POSES.aim2 : POSES.aim1;
  const c = fists ? POSES.carryFists : s.weapon === 'rocket' ? POSES.carryRocket : s.weapon === 'minigun' ? POSES.carryMinigun : two ? POSES.carry2 : POSES.carry1;
  const k = s.aim;
  // lockerer Armschwung, leicht verzögert gegenüber den Beinen
  const swingR = -Math.sin(phase + Math.PI - 0.25) * 0.4 * amp; // rechter Arm gegen rechtes Bein
  const swingL = -Math.sin(phase - 0.25) * 0.4 * amp;
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
  rig.gunPivot.position.set(lerp(c.gun[0], a.gun[0], k), lerp(c.gun[1], a.gun[1], k) + rig.body.position.y, lerp(c.gun[2], a.gun[2], k));
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
  rig.gunPivot.visible = false;
  shoulders(rig);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.body.position.z = 0;
  const m = moving;
  const c = Math.sin(t), c2 = Math.sin(t + Math.PI);
  // Becken tief, Oberschenkel senkrecht, Unterschenkel liegen nach hinten auf dem Boden
  rig.body.position.y = -0.42 + Math.abs(Math.sin(t)) * 0.03 * m;
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

/** liegende Pose (tot) */
/**
 * Sterben: erst knicken die Knie ein und der Oberkörper sackt nach vorn (0–0,22 s),
 * dann kippt der Körper mit zunehmender Geschwindigkeit nach hinten um (bis 0,72 s),
 * prallt kurz auf und bleibt entspannt liegen.
 */
export function poseDeath(rig: Rig, t: number) {
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const A = 0.25, B = 0.85;
  const a = Math.min(1, t / A);
  const ea = 1 - Math.pow(1 - a, 2);
  const b = Math.max(0, Math.min(1, (t - A) / (B - A)));
  const eb = b * b; // wie Schwerkraft: wird schneller
  shoulders(rig);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.gunPivot.visible = false;
  rig.body.position.z = 0;
  // Einknicken
  const knee = lerp(-0.95 * ea, -0.35, eb);
  const hip = lerp(0.55 * ea, 0.15, eb);
  rig.legs[0].hip.rotation.set(0, 0, hip);
  rig.legs[1].hip.rotation.set(0, 0, hip * 0.8);
  rig.legs.forEach((l, i) => (l.knee.rotation.z = knee * (i ? 0.9 : 1)));
  rig.torso.rotation.set(0, 0, lerp(-0.3 * ea, 0.05, eb));
  rig.head.rotation.set(0, 0, lerp(-0.35 * ea, 0.15, eb));
  // Arme: erst schlaff, beim Umkippen fliegen sie nach oben, danach liegen sie locker
  const flail = Math.sin(b * Math.PI) * 0.6;
  rig.arms[0].shoulder.rotation.set(flail * 0.4, 0, lerp(0.25 * ea, 2.3, eb) + flail);
  rig.arms[1].shoulder.rotation.set(-flail * 0.4, 0, lerp(0.2 * ea, 2.1, eb) + flail * 0.8);
  rig.arms.forEach((ar) => { ar.elbow.rotation.set(0, 0, lerp(0.45, 0.6, eb)); });
  // Umkippen nach hinten; beim Aufprall kurz nachfedern
  const impact = Math.max(0, t - B);
  const bounce = impact > 0 ? Math.sin(impact * 20) * 0.07 * Math.exp(-impact * 7) : 0;
  rig.body.rotation.z = eb * (Math.PI / 2) - Math.abs(bounce);
  rig.body.position.y = lerp(-0.28 * ea, 0, eb);
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
function chuteTexture(d: ChuteDesign, cells: number, copies: number) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 256;
  const c = cv.getContext('2d')!;
  for (let i = 0; i < cells; i++) {
    c.fillStyle = hexs(i % 2 === 0 ? d.color : d.accent);
    c.fillRect((i / cells) * 1024, 0, 1024 / cells + 1, 256);
  }
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
