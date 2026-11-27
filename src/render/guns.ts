import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TIER_COLORS, WeaponId } from '../weapons';

/**
 * Neue Waffenmodelle: abgerundete Teile, dunkler Comic-Umriss, Leuchtstreifen in Seltenheitsfarbe.
 * Legendär (5): ganze Waffe golden und glänzend.
 * Zeigt nach +X, Ursprung am Griff. Teile werden je Material zu einem Mesh zusammengefasst.
 */
const OUT = 0.0075;
let outlineMat: THREE.ShaderMaterial | null = null;
const outline = () => (outlineMat ??= new THREE.ShaderMaterial({
  side: THREE.BackSide,
  vertexShader: `void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vec3 wn = normalize(mat3(modelMatrix) * normal); wp.xyz += wn * ${OUT}; gl_Position = projectionMatrix * viewMatrix * wp; }`,
  fragmentShader: `void main(){ gl_FragColor = vec4(0.05,0.06,0.09,1.0); }`,
}));

type Mats = Record<string, THREE.Material>;
const matCache = new Map<number, Mats>();

function mats(tier: number, gradient: THREE.Texture): Mats {
  const hit = matCache.get(tier);
  if (hit) return hit;
  const toon = (c: number) => new THREE.MeshToonMaterial({ color: c, gradientMap: gradient });
  const tc = TIER_COLORS[tier] ?? 0xbfc5cc;
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(tc).multiplyScalar(1.15) });
  let m: Mats = {
    gun: toon(0x2a2e37), steel: toon(0x59616f), light: toon(0x9aa3b2), poly: toon(0x1c1e24),
    wood: toon(0xa8662e), wood2: toon(0x7a4520), olive: toon(0x5b6a3f), olive2: toon(0x45512f), tan: toon(0xc9a56a),
    tier: toon(tc), tierGlow: glow, red: toon(0xe0352f), brass: toon(0xe0b23c),
    yellow: toon(0xffcc2e), lensB: new THREE.MeshBasicMaterial({ color: 0x7fe0ff }), lensR: new THREE.MeshBasicMaterial({ color: 0xff3b3b }), white: toon(0xf2f2f2),
    glass: new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  };
  if (tier === 5) {
    // Gold: glänzend (Phong mit starkem Glanzlicht), dunkleres Gold für Akzente
    const gold = (c: number, e: number) => new THREE.MeshPhongMaterial({ color: c, specular: 0xfff1b8, shininess: 90, emissive: e });
    const g1 = gold(0xf0b52a, 0x3a2400), g2 = gold(0xc98a16, 0x2a1800), g3 = gold(0xffd65a, 0x4a3200);
    m = { ...m, gun: g2, steel: g1, light: g3, poly: g2, wood: g1, wood2: g2, olive: g1, olive2: g2, tan: g3, tier: g3, white: g3,
      tierGlow: new THREE.MeshBasicMaterial({ color: 0xfff3b0 }) };
  }
  matCache.set(tier, m);
  return m;
}

const geoCache = new Map<string, THREE.Group>();

export function buildGun(id: WeaponId, tier: number, gradient: THREE.Texture): THREE.Group {
  const key = id + ':' + tier;
  const hit = geoCache.get(key);
  if (hit) return hit.clone();
  const C = mats(tier, gradient);
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material; outline: boolean; spin: boolean }[] = [];
  let spinning = false;
  const tmp = new THREE.Object3D();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0, ol = true, ry = 0, rx = 0) => {
    tmp.position.set(x, y, z); tmp.rotation.set(rx, ry, rz); tmp.updateMatrix();
    const gg = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(tmp.matrix);
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal') gg.deleteAttribute(k);
    parts.push({ geo: gg, mat, outline: ol, spin: spinning });
  };
  const rb = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z = 0, rz = 0, r = 0.018, ol = true) =>
    add(new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(r, sx / 2.2, sy / 2.2, sz / 2.2)), mat, x, y, z, rz, ol);
  const cx = (mat: THREE.Material, len: number, r: number, x: number, y: number, z = 0, seg = 16, ol = true, r2 = r) =>
    add(new THREE.CylinderGeometry(r2, r, len, seg).rotateZ(Math.PI / 2), mat, x, y, z, 0, ol);
  const cy = (mat: THREE.Material, len: number, r: number, x: number, y: number, z = 0, rz = 0, ol = true) =>
    add(new THREE.CylinderGeometry(r, r, len, 12), mat, x, y, z, rz, ol);
  const ball = (mat: THREE.Material, r: number, x: number, y: number, z = 0, ol = true) => add(new THREE.SphereGeometry(r, 12, 8), mat, x, y, z, 0, ol);
  const stripe = (sx: number, sy: number, x: number, y: number, zHalf: number, rz = 0) => { for (const s of [-1, 1]) rb(C.tierGlow, sx, sy, 0.006, x, y, s * zHalf, rz, 0.003, false); };
  const mag = (mat: THREE.Material, x: number, y: number, w: number, d: number, segs: number, step: number, bend: number, baseMat: THREE.Material) => {
    let px = x, py = y, a = 0;
    for (let i = 0; i < segs; i++) {
      rb(mat, w, step * 1.15, d, px, py, 0, a, 0.012);
      a += bend; px += Math.sin(a) * step; py -= Math.cos(a) * step;
    }
    rb(baseMat, w * 1.15, 0.03, d * 1.1, px - Math.sin(a) * step * 0.35, py + Math.cos(a) * step * 0.35, 0, a, 0.01);
  };
  void cy; void ball; void mag; void stripe;

  switch (id) {
    case 'pistol': {
      rb(C.steel, 0.46, 0.115, 0.098, 0.18, 0.075, 0, 0, 0.02);                 // Schlitten
      for (let i = 0; i < 5; i++) rb(C.gun, 0.012, 0.08, 0.104, -0.02 + i * 0.022, 0.078, 0, 0, 0.004, false); // Rillen
      rb(C.gun, 0.07, 0.03, 0.1, 0.2, 0.092, 0, 0, 0.008, false);               // Auswurf
      cx(C.gun, 0.03, 0.022, 0.42, 0.08);                                       // Mündung
      rb(C.poly, 0.38, 0.07, 0.09, 0.15, -0.0, 0, 0, 0.018);                    // Rahmen
      rb(C.poly, 0.12, 0.27, 0.092, 0.0, -0.13, 0, -0.22, 0.03);                // Griff
      rb(C.tier, 0.085, 0.17, 0.1, 0.0, -0.135, 0, -0.22, 0.02);                // Griffschale
      rb(C.poly, 0.13, 0.022, 0.03, 0.1, -0.085, 0, 0, 0.008);                  // Abzugsbügel
      rb(C.gun, 0.022, 0.05, 0.025, 0.09, -0.055, 0, 0.2, 0.006);               // Abzug
      ball(C.tierGlow, 0.012, 0.39, 0.142, 0, false);                            // Leuchtkorn
      for (const s of [-1, 1]) rb(C.gun, 0.02, 0.025, 0.018, -0.02, 0.142, s * 0.022, 0, 0.004);
      stripe(0.2, 0.012, 0.22, 0.045, 0.05);
      break;
    }
    case 'smg': {
      rb(C.poly, 0.5, 0.15, 0.12, 0.2, 0.03, 0, 0, 0.025);                      // Gehäuse
      rb(C.gun, 0.42, 0.028, 0.06, 0.2, 0.118, 0, 0, 0.006);                    // Schiene
      for (let i = 0; i < 8; i++) rb(C.steel, 0.018, 0.012, 0.064, 0.02 + i * 0.05, 0.135, 0, 0, 0.003, false);
      cx(C.steel, 0.2, 0.048, 0.54, 0.04);                                       // Laufmantel
      for (let i = 0; i < 3; i++) cx(C.gun, 0.016, 0.05, 0.48 + i * 0.05, 0.04, 0, 20, false);
      cx(C.gun, 0.08, 0.03, 0.68, 0.04);                                         // Mündung
      // Rotpunkt
      rb(C.gun, 0.1, 0.03, 0.06, 0.16, 0.145, 0, 0, 0.008);
      rb(C.gun, 0.11, 0.075, 0.075, 0.16, 0.195, 0, 0, 0.02);
      add(new THREE.CircleGeometry(0.026, 20).rotateY(Math.PI / 2), C.lensR, 0.216, 0.198, 0, 0, false);
      mag(C.gun, 0.26, -0.1, 0.075, 0.08, 4, 0.06, 0.07, C.tier);                // Magazin
      rb(C.poly, 0.095, 0.21, 0.09, 0.02, -0.12, 0, -0.25, 0.025);               // Griff
      rb(C.poly, 0.065, 0.16, 0.065, 0.42, -0.1, 0, 0.08, 0.02);                 // Frontgriff
      rb(C.poly, 0.12, 0.022, 0.03, 0.12, -0.075, 0, 0, 0.008);
      for (const s of [-1, 1]) rb(C.steel, 0.3, 0.022, 0.022, -0.17, 0.02, s * 0.04, 0.08, 0.008); // Klappschaft
      rb(C.poly, 0.045, 0.16, 0.11, -0.33, 0.0, 0, 0.08, 0.016);
      stripe(0.3, 0.014, 0.24, 0.0, 0.061);
      break;
    }
    case 'shotgun': {
      rb(C.gun, 0.34, 0.16, 0.12, 0.06, 0.02, 0, 0, 0.025);                     // Gehäuse
      rb(C.poly, 0.12, 0.04, 0.124, 0.08, 0.05, 0, 0, 0.008, false);            // Auswurf
      cx(C.steel, 0.95, 0.042, 0.6, 0.065);                                     // Lauf
      cx(C.gun, 0.72, 0.034, 0.5, -0.015);                                      // Röhrenmagazin
      for (const bx of [0.82, 1.02]) { cx(C.gun, 0.03, 0.05, bx, 0.065, 0, 20); if (bx < 0.9) cx(C.gun, 0.03, 0.042, bx, -0.015, 0, 20); } // Laufbänder
      ball(C.tierGlow, 0.014, 1.07, 0.115, 0, false);                            // Korn
      rb(C.wood, 0.3, 0.1, 0.13, 0.56, -0.02, 0, 0, 0.03);                      // Pumpe
      for (let i = 0; i < 4; i++) rb(C.wood2, 0.012, 0.09, 0.134, 0.46 + i * 0.065, -0.02, 0, 0, 0.004, false);
      rb(C.wood, 0.14, 0.15, 0.1, -0.12, -0.05, 0, -0.35, 0.03);                // Griffstück
      rb(C.wood, 0.42, 0.13, 0.095, -0.34, -0.06, 0, 0.1, 0.035);               // Schaft
      rb(C.poly, 0.04, 0.17, 0.1, -0.56, -0.08, 0, 0.1, 0.015);                 // Schaftkappe
      rb(C.poly, 0.18, 0.075, 0.02, -0.3, -0.04, 0.055, 0.1, 0.008);            // Patronenhalter
      for (let i = 0; i < 4; i++) {
        const sx = -0.37 + i * 0.045, sy = -0.035 + i * 0.0045;
        cy(C.red, 0.06, 0.016, sx, sy, 0.07, 0, true);
        cy(C.brass, 0.018, 0.017, sx, sy - 0.035, 0.07, 0, false);
      }
      rb(C.poly, 0.13, 0.022, 0.03, 0.0, -0.075, 0, 0, 0.008);
      stripe(0.16, 0.016, 0.0, -0.02, 0.061);
      break;
    }
    case 'rifle': {
      rb(C.gun, 0.42, 0.11, 0.11, 0.14, 0.055, 0, 0, 0.02);                     // Oberteil
      rb(C.poly, 0.3, 0.08, 0.1, 0.1, -0.03, 0, 0, 0.02);                       // Unterteil
      rb(C.tan, 0.42, 0.12, 0.115, 0.56, 0.045, 0, 0, 0.03);                    // Handschutz
      for (let i = 0; i < 4; i++) for (const s of [-1, 1]) rb(C.olive2, 0.055, 0.024, 0.01, 0.43 + i * 0.085, 0.045, s * 0.058, 0, 0.008, false);
      rb(C.gun, 0.8, 0.026, 0.055, 0.35, 0.118, 0, 0, 0.006);                   // Schiene
      cx(C.steel, 0.24, 0.022, 0.88, 0.045);                                    // Lauf
      rb(C.gun, 0.09, 0.05, 0.05, 1.02, 0.045, 0, 0, 0.01);                     // Mündungsbremse
      for (const s of [-1, 1]) rb(C.poly, 0.05, 0.014, 0.006, 1.02, 0.045, s * 0.026, 0, 0.003, false);
      // Holo-Visier
      rb(C.gun, 0.12, 0.025, 0.06, 0.12, 0.142, 0, 0, 0.006);
      rb(C.gun, 0.02, 0.08, 0.07, 0.07, 0.19, 0, 0, 0.006);
      rb(C.gun, 0.11, 0.018, 0.07, 0.12, 0.235, 0, 0, 0.006);
      add(new THREE.PlaneGeometry(0.06, 0.06).rotateY(Math.PI / 2), C.glass, 0.17, 0.19, 0, 0, false);
      ball(C.lensR, 0.007, 0.171, 0.19, 0, false);
      mag(C.poly, 0.22, -0.09, 0.08, 0.075, 4, 0.065, 0.1, C.tier);             // Magazin
      rb(C.poly, 0.09, 0.2, 0.085, -0.02, -0.12, 0, -0.25, 0.025);              // Griff
      rb(C.poly, 0.13, 0.022, 0.03, 0.08, -0.08, 0, 0, 0.008);
      rb(C.steel, 0.05, 0.02, 0.03, -0.05, 0.1, 0.05, 0, 0.006);                // Ladehebel
      cx(C.gun, 0.24, 0.03, -0.18, 0.04);                                       // Schaftrohr
      rb(C.tan, 0.22, 0.12, 0.09, -0.34, 0.02, 0, 0.03, 0.03);                  // Schaft
      rb(C.poly, 0.035, 0.15, 0.095, -0.46, 0.015, 0, 0.03, 0.012);
      stripe(0.34, 0.012, 0.56, 0.085, 0.059);
      break;
    }
    case 'sniper': {
      rb(C.olive, 0.64, 0.13, 0.11, 0.12, 0.0, 0, 0, 0.03);                     // Gehäuse
      rb(C.olive, 0.32, 0.09, 0.1, 0.56, -0.01, 0, 0, 0.03);                    // Vorderschaft
      cx(C.steel, 0.8, 0.026, 1.04, 0.02);                                      // Lauf
      for (let i = 0; i < 6; i++) cx(C.gun, 0.03, 0.028, 0.75 + i * 0.09, 0.02, 0, 20, false); // Riefen
      rb(C.gun, 0.12, 0.055, 0.055, 1.46, 0.02, 0, 0, 0.012);                   // Mündungsbremse
      for (const s of [-1, 1]) rb(C.poly, 0.07, 0.016, 0.006, 1.46, 0.02, s * 0.028, 0, 0.003, false);
      rb(C.gun, 0.34, 0.03, 0.06, 0.12, 0.08, 0, 0, 0.006);                     // Schiene
      cx(C.gun, 0.46, 0.042, 0.12, 0.165);                                      // Zielfernrohr
      cx(C.gun, 0.1, 0.064, 0.4, 0.165, 0, 24, true, 0.044);                    // Objektiv (konisch)
      cx(C.gun, 0.08, 0.052, -0.15, 0.165, 0, 24, true, 0.042);                 // Okular
      add(new THREE.CircleGeometry(0.056, 24).rotateY(Math.PI / 2), C.lensB, 0.452, 0.165, 0, 0, false);
      cx(C.steel, 0.035, 0.047, 0.12, 0.165);
      cy(C.steel, 0.05, 0.022, 0.12, 0.22);
      add(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 14).rotateX(Math.PI / 2), C.steel, 0.12, 0.165, 0.065);
      for (const rx of [-0.02, 0.26]) rb(C.gun, 0.04, 0.07, 0.075, rx, 0.115, 0, 0, 0.01);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 10).rotateX(Math.PI / 2), C.steel, -0.03, 0.04, 0.07);
      ball(C.gun, 0.03, -0.03, 0.04, 0.135);
      rb(C.gun, 0.11, 0.1, 0.08, 0.17, -0.1, 0, 0, 0.015);                      // Magazin
      rb(C.tier, 0.12, 0.022, 0.085, 0.17, -0.155, 0, 0, 0.008);
      rb(C.olive, 0.085, 0.21, 0.08, -0.06, -0.13, 0, -0.35, 0.025);            // Griff
      rb(C.poly, 0.12, 0.022, 0.03, 0.03, -0.075, 0, 0, 0.008);
      rb(C.olive, 0.44, 0.11, 0.08, -0.37, -0.02, 0, 0.05, 0.03);              // Schaft
      rb(C.olive2, 0.28, 0.055, 0.078, -0.34, 0.065, 0, 0, 0.02);               // Wangenauflage
      rb(C.poly, 0.04, 0.19, 0.088, -0.6, -0.04, 0, 0.05, 0.015);
      for (const s of [-1, 1]) {                                                 // Zweibein
        add(new THREE.CylinderGeometry(0.01, 0.01, 0.26, 8).rotateZ(Math.PI / 2), C.steel, 0.66, -0.075, s * 0.03, 0, true);
        ball(C.poly, 0.016, 0.79, -0.075, s * 0.03);
      }
      stripe(0.26, 0.014, 0.44, 0.03, 0.051);
      break;
    }
    case 'minigun': {
      rb(C.gun, 0.46, 0.28, 0.26, 0.02, 0.0, 0, 0, 0.05);                       // Körper
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) rb(C.tierGlow, 0.2, 0.018, 0.006, 0.04, 0.06 - i * 0.05, s * 0.132, 0, 0.004, false); // Kühlschlitze
      cx(C.steel, 0.14, 0.13, 0.32, 0.0);                                       // Motor
      spinning = true;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        cx(C.light, 0.82, 0.024, 0.78, Math.cos(a) * 0.075, Math.sin(a) * 0.075, 14);
      }
      cx(C.gun, 0.03, 0.105, 1.19, 0, 0, 24);
      spinning = false;
      for (const rx of [0.52, 0.86, 1.15]) cx(C.gun, 0.05, 0.12, rx, 0, 0, 24);  // Ringe
      cx(C.tier, 0.025, 0.122, 0.86, 0, 0, 24, false);
      rb(C.olive, 0.26, 0.22, 0.2, -0.06, -0.26, 0, 0, 0.03);                   // Munitionskiste
      rb(C.yellow, 0.27, 0.035, 0.205, -0.06, -0.2, 0, 0, 0.008, false);
      for (let i = 0; i < 6; i++) {                                              // Gurt
        const t = i / 5, x = 0.06 + t * 0.14, y = -0.17 + Math.sin(t * Math.PI) * 0.04 + t * 0.07;
        cy(C.brass, 0.05, 0.014, x, y, 0.1, 0.3, true);
      }
      for (const s of [-1, 1]) rb(C.steel, 0.025, 0.11, 0.025, 0.02, 0.18, s * 0.08, 0, 0.008); // Tragegriff
      rb(C.poly, 0.28, 0.035, 0.2, 0.02, 0.235, 0, 0, 0.015);
      rb(C.poly, 0.06, 0.18, 0.07, -0.25, -0.02, 0, -0.15, 0.02);               // Griff hinten
      break;
    }
    case 'rocket': {
      cx(C.olive, 1.2, 0.11, 0.32, 0.06, 0, 28);                                // Rohr
      cx(C.gun, 0.1, 0.14, 0.94, 0.06, 0, 28, true, 0.12);                      // vorne
      cx(C.gun, 0.16, 0.15, -0.32, 0.06, 0, 28, true, 0.11);                   // hinten (Trichter)
      for (let i = 0; i < 4; i++) cx(i % 2 ? C.poly : C.yellow, 0.035, 0.113, 0.7 + i * 0.035, 0.06, 0, 28, false);
      cx(C.tier, 0.06, 0.113, 0.0, 0.06, 0, 28, false);
      add(new THREE.ConeGeometry(0.075, 0.18, 20).rotateZ(-Math.PI / 2), C.red, 1.07, 0.06, 0, 0, true); // Sprengkopf
      cx(C.white, 0.04, 0.076, 0.98, 0.06, 0, 20, true);
      rb(C.gun, 0.16, 0.08, 0.06, 0.3, 0.2, 0.0, 0, 0.015);                     // Optik
      cx(C.gun, 0.06, 0.03, 0.4, 0.2, 0, 16);
      add(new THREE.CircleGeometry(0.026, 18).rotateY(Math.PI / 2), C.lensB, 0.432, 0.2, 0, 0, false);
      rb(C.poly, 0.09, 0.2, 0.08, 0.08, -0.12, 0, -0.15, 0.025);                // Griff
      rb(C.poly, 0.07, 0.16, 0.07, 0.48, -0.1, 0, 0.05, 0.02);                  // Frontgriff
      rb(C.poly, 0.3, 0.05, 0.13, -0.05, -0.04, 0, 0, 0.02);                    // Schulterpolster
      break;
    }
  }

  // zusammenfassen: je Material ein Mesh, plus ein gemeinsamer Umriss (Hauptteil und drehende Läufe getrennt)
  const g = new THREE.Group();
  const spin = new THREE.Group();
  spin.name = 'spin';
  for (const sp of [false, true]) {
    const target = sp ? spin : g;
    const sel = parts.filter((p) => p.spin === sp);
    if (!sel.length) continue;
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const p of sel) { const l = byMat.get(p.mat) ?? []; l.push(p.geo); byMat.set(p.mat, l); }
    for (const [mat, geos] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(geos)!, mat);
      mesh.castShadow = true;
      target.add(mesh);
    }
    const ol = sel.filter((p) => p.outline).map((p) => p.geo);
    if (ol.length) target.add(new THREE.Mesh(mergeGeometries(ol)!, outline()));
  }
  if (spin.children.length) g.add(spin);
  geoCache.set(key, g);
  return g.clone();
}
