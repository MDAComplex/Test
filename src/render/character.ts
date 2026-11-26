import * as THREE from 'three';

/** Figur mit Gelenken (Hüfte/Knie, Schulter/Ellbogen), zeigt nach +X, Füße bei y = 0 */
export interface Rig {
  body: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  /** [rechts, links]: Oberschenkel-Gruppe und Knie-Gruppe */
  legs: { hip: THREE.Group; knee: THREE.Group }[];
  /** [rechts, links]: Schulter-Gruppe und Ellbogen-Gruppe */
  arms: { shoulder: THREE.Group; elbow: THREE.Group }[];
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
  const legs = [0.15, -0.15].map((z) => {
    const hip = new THREE.Group();
    hip.position.set(0, 0.9, z);
    mk(hip, G.capsule, pants, 0, -0.22, 0, man ? 0.12 : 0.11, 0.15, man ? 0.12 : 0.11);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    mk(knee, G.capsule, pants, 0, -0.2, 0, 0.1, 0.14, 0.1);
    mk(knee, G.box, shoe, 0.07, -0.41, 0, 0.3, 0.12, 0.15);
    mk(knee, G.box, sole, 0.07, -0.46, 0, 0.31, 0.04, 0.16);
    hip.add(knee);
    body.add(hip);
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
  head.position.y = 0.92;
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
  const arms = [shoulderW, -shoulderW].map((z) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0, 0.52, z);
    mk(shoulder, G.capsule, shirtMat, 0, -0.14, 0, 0.09, 0.1, 0.09);
    const elbow = new THREE.Group();
    elbow.position.y = -0.31;
    mk(elbow, G.capsule, skin, 0, -0.13, 0, 0.075, 0.1, 0.075);
    mk(elbow, G.sphere, skin, 0, -0.29, 0, 0.085, 0.09, 0.08);
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  });

  const gunPivot = new THREE.Group();
  const gunKick = new THREE.Group();
  gunPivot.add(gunKick);
  body.add(gunPivot);
  return { body, torso, head, legs, arms, gunPivot, gunKick, shirtMat, mats: [shirtMat, shirtDark] };
}

interface ArmPose { r: [number, number, number]; l: [number, number, number]; gun: [number, number, number]; gunRot: [number, number] }
// Schulter rotation.z, rotation.x, Ellbogen rotation.z; Waffenposition; Waffenrotation [y, z]
const POSES: Record<string, ArmPose> = {
  aim2: { r: [1.2, 0.3, 0.35], l: [1.12, -0.85, 0.55], gun: [0.34, 1.36, 0.06], gunRot: [0, 0] },
  carry2: { r: [0.35, 0.12, 1.05], l: [0.75, -0.55, 1.1], gun: [0.26, 1.2, 0.06], gunRot: [0.8, 0.35] },
  aim1: { r: [1.5, 0.12, 0.05], l: [0, 0, 0.25], gun: [0.68, 1.5, 0.3], gunRot: [0, 0] },
  carry1: { r: [0.12, 0, 0.45], l: [0, 0, 0.3], gun: [0.22, 1.0, 0.42], gunRot: [0, -1.1] },
};

export interface AnimState {
  phase: number;
  /** 0 = steht, 1 = läuft normal */
  amp: number;
  aim: number;
  twoHanded: boolean;
  reload: number;
  time: number;
  falling: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Gehen mit Knie- und Ellbogenbeugung, Hüftwippen und Gegendrehung des Oberkörpers */
export function animateRig(rig: Rig, s: AnimState) {
  const { phase, amp } = s;
  if (s.falling) {
    // am Fallschirm: Arme halten die Leinen, Beine baumeln
    const sway = Math.sin(s.time * 2.4 + phase);
    rig.legs[0].hip.rotation.z = 0.15 + sway * 0.12;
    rig.legs[1].hip.rotation.z = -0.05 - sway * 0.12;
    rig.legs.forEach((l) => (l.knee.rotation.z = -0.35));
    rig.arms[0].shoulder.rotation.set(0.35, 0, 2.6);
    rig.arms[1].shoulder.rotation.set(-0.35, 0, 2.6);
    rig.arms.forEach((a) => (a.elbow.rotation.z = 0.3));
    rig.torso.rotation.y = 0;
    rig.body.position.y = 0;
    rig.gunPivot.visible = false;
    return;
  }
  rig.gunPivot.visible = true;
  for (let i = 0; i < 2; i++) {
    const p = phase + (i === 0 ? 0 : Math.PI);
    const leg = rig.legs[i];
    leg.hip.rotation.z = Math.sin(p) * 0.62 * amp;
    // Knie beugt sich, wenn das Bein nach vorne schwingt und beim Abdrücken
    leg.knee.rotation.z = -(Math.max(0, Math.cos(p)) * 0.95 + 0.08) * amp;
  }
  rig.body.position.y = Math.abs(Math.sin(phase)) * 0.06 * amp - 0.02 * amp;
  rig.torso.rotation.y = Math.sin(phase) * 0.12 * amp;
  rig.torso.rotation.z = -0.06 * amp; // leicht nach vorne geneigt
  // Atmen im Stand
  rig.torso.position.y = 1.0 + (1 - amp) * Math.sin(s.time * 2.2) * 0.012;

  const two = s.twoHanded;
  const a = two ? POSES.aim2 : POSES.aim1;
  const c = two ? POSES.carry2 : POSES.carry1;
  const k = s.aim;
  const swingR = -Math.sin(phase + Math.PI) * 0.45 * amp; // rechter Arm gegen rechtes Bein
  const swingL = -Math.sin(phase) * 0.45 * amp;
  const free = (i: 0 | 1) => (i === 0 ? swingR : swingL);
  const set = (i: 0 | 1, carry: [number, number, number], aim: [number, number, number], swingable: boolean) => {
    const arm = rig.arms[i];
    const sw = swingable ? free(i) : 0;
    arm.shoulder.rotation.z = lerp(carry[0] + sw, aim[0], k);
    arm.shoulder.rotation.x = lerp(carry[1], aim[1], k);
    arm.elbow.rotation.z = lerp(carry[2] + (swingable ? Math.max(0, sw) * 0.5 : 0), aim[2], k);
  };
  set(0, c.r, a.r, !two);
  set(1, c.l, a.l, !two);
  if (!two) {
    // freie linke Hand schwingt auch beim Zielen mit der Pistole
    rig.arms[1].shoulder.rotation.z = swingL;
  }
  rig.gunPivot.position.set(lerp(c.gun[0], a.gun[0], k), lerp(c.gun[1], a.gun[1], k) + rig.body.position.y, lerp(c.gun[2], a.gun[2], k));
  rig.gunPivot.rotation.set(0, lerp(c.gunRot[0], a.gunRot[0], k), lerp(c.gunRot[1], a.gunRot[1], k));
  if (s.reload > 0.01) {
    rig.gunPivot.rotation.z -= 0.75 * s.reload;
    rig.gunPivot.rotation.x = Math.sin(s.time * 14) * 0.15 * s.reload;
    rig.gunPivot.position.y -= 0.18 * s.reload;
    rig.arms[1].shoulder.rotation.z = lerp(rig.arms[1].shoulder.rotation.z, 0.9, s.reload);
    rig.arms[1].elbow.rotation.z = lerp(rig.arms[1].elbow.rotation.z, 1.2, s.reload);
  } else {
    rig.gunPivot.rotation.x = 0;
  }
}

/** liegende Pose (niedergeschlagen kriechen oder tot) */
export function poseLying(rig: Rig, t: number, crawl: boolean) {
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
