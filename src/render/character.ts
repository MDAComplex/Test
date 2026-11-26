import * as THREE from 'three';

/** Figur mit Gelenken (Hüfte/Knie, Schulter/Ellbogen), zeigt nach +X, Füße bei y = 0 */
export interface Rig {
  body: THREE.Group;
  torso: THREE.Group;
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
export type ChuteKind = 'round' | 'wing';

const SKIN_TONES = [0xf7d2ad, 0xeec29a, 0xd9a274, 0xb57a50, 0x8d5a3a];
const HAIR_COLORS = [0x3a2a1e, 0x1f1a17, 0x7a4a26, 0xc89a55, 0xa4472a];

/** geteilte Geometrien (einmal erzeugt) */
const G = {
  capsule: new THREE.CapsuleGeometry(1, 1, 6, 14),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  hemi: new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  ring: new THREE.TorusGeometry(1, 0.25, 8, 20),
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
    const g = new THREE.CylinderGeometry(1, 1, y0 - y1, 12, segs, true);
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
  const capTop = new THREE.SphereGeometry(r0, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  const capBot = new THREE.SphereGeometry(r2, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
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
}): Rig {
  const { kind, toon } = opts;
  const rnd = (() => { let s = (opts.seed * 2654435761) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const skin = toon(SKIN_TONES[Math.floor(rnd() * SKIN_TONES.length)]);
  const hair = toon(HAIR_COLORS[Math.floor(rnd() * HAIR_COLORS.length)]);
  const shirtMat = new THREE.MeshToonMaterial({ color: opts.shirt, gradientMap: opts.gradient });
  const shirtDark = new THREE.MeshToonMaterial({ color: new THREE.Color(opts.shirt).multiplyScalar(0.7), gradientMap: opts.gradient });
  const pants = toon(kind === 'man' ? 0x3d5480 : 0x2e2f3b);
  const shoe = toon(0xf1f1f1);
  const sole = toon(0x2a2a30);
  const dark = toon(0x1c1c22);
  const white = toon(0xffffff);
  const belt = toon(0x4a3626);

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
  const shoulderW = man ? 0.37 : 0.32;

  // Beine: Hüfte -> Knie -> Fuß
  const binds: (() => void)[] = [];
  const legGeo = limbGeometry(0.44, 0.38, man ? 0.125 : 0.115, man ? 0.1 : 0.092, 0.085, 0);
  const legs = [0.15, -0.15].map((z) => {
    // Knochen: Hüfte -> Knie; ein durchgehendes Hosenbein darüber
    const holder = new THREE.Group();
    body.add(holder);
    const hip = new THREE.Bone();
    hip.position.set(0, 0.9, z);
    const knee = new THREE.Bone();
    knee.position.y = -0.44;
    hip.add(knee);
    const limb = skinnedLimb(legGeo, pants, hip, knee);
    limb.mesh.add(hip);
    holder.add(limb.mesh);
    binds.push(limb.bind);
    mk(knee, G.box, shoe, 0.07, -0.41, 0, 0.3, 0.12, 0.15);
    mk(knee, G.box, sole, 0.07, -0.46, 0, 0.31, 0.04, 0.16);
    return { hip, knee };
  });
  // Becken
  mk(body, G.box, pants, 0, 0.94, 0, 0.3, 0.2, man ? 0.4 : 0.38);

  // Oberkörper (mit eigener Gruppe für die Gegendrehung beim Gehen)
  const torso = new THREE.Group();
  torso.position.y = 1.0;
  body.add(torso);
  mk(torso, G.capsule, shirtMat, 0, 0.3, 0, 0.24, man ? 0.2 : 0.18, man ? 0.36 : 0.31);
  mk(torso, G.cyl, belt, 0, 0.02, 0, man ? 0.25 : 0.23, 0.06, man ? 0.34 : 0.3);
  // Kragen
  mk(torso, G.ring, shirtDark, 0, 0.6, 0, 0.13, 0.13, 0.13).rotation.x = Math.PI / 2;
  if (!man) mk(torso, G.capsule, shirtMat, 0.08, 0.36, 0, 0.16, 0.08, 0.26);
  // Hals
  mk(torso, G.cyl, skin, 0, 0.66, 0, 0.09, 0.14, 0.09);

  // Kopf: dreht sich vor dem Körper in die neue Richtung
  const head = new THREE.Group();
  head.position.y = 0.95;
  head.scale.setScalar(1.1);
  torso.add(head);
  mk(head, G.sphere, skin, 0, 0, 0, 0.34, 0.36, 0.33);
  mk(head, G.sphere, skin, 0, -0.02, 0.33, 0.06, 0.08, 0.04);
  mk(head, G.sphere, skin, 0, -0.02, -0.33, 0.06, 0.08, 0.04);
  for (const ez of [0.12, -0.12]) {
    mk(head, G.sphere, white, 0.28, 0.04, ez, 0.06, 0.07, 0.06);
    mk(head, G.sphere, dark, 0.32, 0.04, ez, 0.035, 0.045, 0.035);
    mk(head, G.box, hair, 0.29, 0.13, ez, 0.03, 0.025, 0.1).rotation.x = ez > 0 ? -0.15 : 0.15;
  }
  mk(head, G.sphere, skin, 0.33, -0.04, 0, 0.04, 0.05, 0.035);
  mk(head, G.box, toon(0xb5615a), 0.3, -0.15, 0, 0.02, 0.025, 0.09);
  // Haare
  if (man) {
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
  const armGeo = limbGeometry(UPPER, LOWER - 0.06, 0.095, 0.074, 0.066, 0.2);
  const arms = [shoulderW, -shoulderW].map((z) => {
    const shoulder = new THREE.Bone();
    shoulder.position.set(0, 0.52, z);
    shoulder.userData.rest = shoulder.position.clone();
    const elbow = new THREE.Bone();
    elbow.position.y = -UPPER;
    shoulder.add(elbow);
    const limb = skinnedLimb(armGeo, [shirtMat, skin], shoulder, elbow);
    limb.mesh.add(shoulder);
    torso.add(limb.mesh);
    binds.push(limb.bind);
    mk(elbow, G.sphere, skin, 0, -LOWER, 0, 0.09, 0.095, 0.085);
    return { shoulder, elbow };
  });
  // Skelette in der Ruhepose binden
  body.updateMatrixWorld(true);
  binds.forEach((b) => b());

  const gunPivot = new THREE.Group();
  const gunKick = new THREE.Group();
  gunPivot.add(gunKick);
  body.add(gunPivot);
  return { body, torso, head, legs, arms, gunPivot, gunKick, shirtMat, mats: [shirtMat, shirtDark] };
}

interface ArmPose { r: [number, number, number]; l: [number, number, number]; gun: [number, number, number]; gunRot: [number, number] }
// Schulter rotation.z, rotation.x, Ellbogen rotation.z; Waffenposition; Waffenrotation [y, z]
const POSES: Record<string, ArmPose> = {
  aim2: { r: [1.2, 0.3, 0.35], l: [1.12, -0.85, 0.55], gun: [0.2, 1.43, 0.1], gunRot: [0, 0] },
  carry2: { r: [0.35, 0.12, 1.05], l: [0.75, -0.55, 1.1], gun: [0.28, 1.14, 0.12], gunRot: [0.55, -0.28] },
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
  sniper: { r: [-0.02, -0.12, 0], l: [0.42, -0.04, 0] },
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
  if (s.falling) {
    // am Fallschirm: Arme halten die Leinen, Beine baumeln
    const sway = Math.sin(s.time * 2.4 + phase);
    rig.legs[0].hip.rotation.z = 0.15 + sway * 0.12;
    rig.legs[1].hip.rotation.z = -0.05 - sway * 0.12;
    rig.legs.forEach((l) => (l.knee.rotation.z = -0.35));
    rig.arms[0].shoulder.rotation.set(0.35, 0, 2.6);
    rig.arms[1].shoulder.rotation.set(-0.35, 0, 2.6);
    rig.arms.forEach((a) => a.elbow.rotation.set(0, 0, 0.3));
    rig.torso.rotation.set(0, 0, 0);
    rig.body.position.y = 0;
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
  const twist = Math.sin(phase) * 0.05 * amp;
  rig.torso.rotation.set(Math.sin(phase * 2) * 0.012 * amp + Math.sin(phase) * 0.025 * amp, twist + blade, -0.05 * amp);
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
export function poseLying(rig: Rig, t: number, crawl: boolean) {
  shoulders(rig);
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

function stripeTexture(color: number, cells: number) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 32;
  const c = cv.getContext('2d')!;
  for (let i = 0; i < cells; i++) {
    c.fillStyle = i % 2 === 0 ? '#' + color.toString(16).padStart(6, '0') : '#ffffff';
    c.fillRect((i / cells) * 256, 0, 256 / cells + 1, 32);
  }
  c.fillStyle = 'rgba(0,0,0,0.12)';
  c.fillRect(0, 26, 256, 6);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fallschirm: Rundkappe oder moderner Gleitschirm */
export function buildChute(kind: ChuteKind, color: number, gradient: THREE.Texture, lineMat: THREE.Material, harnessY = 2.1) {
  const chute = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const tex = stripeTexture(color, kind === 'round' ? 12 : 9);
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
      pts.push(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR, 0, harnessY, 0);
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
      pts.push(depth / 2 - 0.2, y, z, 0, harnessY, 0, -depth / 2 + 0.2, y, z, 0, harnessY, 0);
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  disposables.push(lg);
  chute.add(new THREE.LineSegments(lg, lineMat));
  return { chute, disposables };
}
