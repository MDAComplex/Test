import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { S } from '../config';
import type { MapData } from '../mapgen';

/**
 * Scharfe Bodenflächen als echte Geometrie: Straßen mit Bordstein und Mittelstreifen,
 * Erdwege, Plätze, Hofflächen und Felder. Der Boden darunter bleibt einfarbig (Textur).
 */
type P2 = { x: number; y: number };

/** Linienzug weich abrunden (Kurven statt Knicke) und gleichmäßig abtasten */
function smooth(pts: P2[], step = 40): P2[] {
  if (pts.length < 3) {
    const a = pts[0], b = pts[1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }));
  }
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, 0, p.y)), false, 'centripetal', 0.5);
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((v) => ({ x: v.x, y: v.z }));
}

/** Band entlang eines Linienzugs (Breite w), runde Enden für saubere Kreuzungen */
function ribbon(line: P2[], w: number, y: number, caps = true): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  const h = w / 2;
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    let dx = b.x - a.x, dy = b.y - a.y; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const p = line[i];
    pos.push((p.x - dy * h) * S, y, (p.y + dx * h) * S, (p.x + dy * h) * S, y, (p.y - dx * h) * S);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const parts = [g.toNonIndexed()];
  if (caps) for (const p of [line[0], line[line.length - 1]]) parts.push(disc(p.x, p.y, h, y, 20));
  return mergeGeometries(parts.map(stripUv))!;
}
function stripUv(g: THREE.BufferGeometry) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position') n.deleteAttribute(k);
  return n;
}
function disc(x: number, y: number, r: number, h: number, seg = 48) {
  const g = new THREE.CircleGeometry(r * S, seg).rotateX(-Math.PI / 2);
  g.translate(x * S, h, y * S);
  return stripUv(g);
}
function ring(x: number, y: number, r0: number, r1: number, h: number, seg = 96) {
  const g = new THREE.RingGeometry(r0 * S, r1 * S, seg).rotateX(-Math.PI / 2);
  g.translate(x * S, h, y * S);
  return stripUv(g);
}
function rect(x: number, y: number, w: number, d: number, h: number, rad = 0, ang = 0) {
  const sh = new THREE.Shape();
  const hw = w / 2 * S, hd = d / 2 * S, rr = Math.min(rad * S, hw, hd);
  sh.moveTo(-hw + rr, -hd); sh.lineTo(hw - rr, -hd); sh.quadraticCurveTo(hw, -hd, hw, -hd + rr);
  sh.lineTo(hw, hd - rr); sh.quadraticCurveTo(hw, hd, hw - rr, hd); sh.lineTo(-hw + rr, hd);
  sh.quadraticCurveTo(-hw, hd, -hw, hd - rr); sh.lineTo(-hw, -hd + rr); sh.quadraticCurveTo(-hw, -hd, -hw + rr, -hd);
  const g = new THREE.ShapeGeometry(sh, 4).rotateX(Math.PI / 2);
  g.rotateY(-ang);
  g.translate(x * S, h, y * S);
  return stripUv(g);
}
/** Mittelstreifen: kurze Striche entlang der Linie, an den Enden frei (Kreuzungen) */
function dashes(line: P2[], y: number, dash = 55, gap = 55, w = 7, skip = 110): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  let total = 0;
  const L: number[] = [0];
  for (let i = 1; i < line.length; i++) { total += Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y); L.push(total); }
  const at = (d: number) => {
    let i = 1; while (i < L.length - 1 && L[i] < d) i++;
    const t = (d - L[i - 1]) / ((L[i] - L[i - 1]) || 1), a = line[i - 1], b = line[i];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, a: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  for (let d = skip; d + dash < total - skip; d += dash + gap) {
    const p = at(d + dash / 2);
    out.push(rect(p.x, p.y, dash, w, y, 0, p.a));
  }
  return out;
}

export interface GroundBuild { meshes: THREE.Mesh[]; dispose: THREE.BufferGeometry[] }

export function buildGround(map: MapData, mat: (c: number, lift: number) => THREE.Material): GroundBuild {
  const layers = new Map<string, { c: number; lift: number; geos: THREE.BufferGeometry[] }>();
  const put = (key: string, c: number, lift: number, g: THREE.BufferGeometry | THREE.BufferGeometry[]) => {
    const l = layers.get(key) ?? { c, lift, geos: [] };
    if (Array.isArray(g)) l.geos.push(...g); else l.geos.push(g);
    layers.set(key, l);
  };
  // Höhen leicht gestaffelt (keine flackernden Flächen)
  const Y = { yard: 0.012, field: 0.014, dirtEdge: 0.016, dirt: 0.018, plaza: 0.02, curb: 0.022, road: 0.026, line: 0.03 };

  // Hofflächen unter den Häusern
  for (const h of map.houses) put('yard', 0xd8b27a, 1, rect(h.x, h.y, h.s + 70, h.s + 70, Y.yard, 36));
  // Felder mit Reihen
  for (const f of map.fields) {
    put('field', 0xe6c86e, 2, rect(f.x, f.y, f.w, f.h, Y.field, 22));
    for (let yy = -f.h / 2 + 34; yy < f.h / 2 - 20; yy += 38) put('fieldRow', 0xcfae52, 3, rect(f.x, f.y + yy, f.w - 40, 9, Y.field + 0.002, 4));
  }
  // Erdwege (Rand etwas dunkler)
  for (const rd of map.roads) {
    if (!rd.dirt) continue;
    const line = smooth(rd.pts, 30);
    put('dirtEdge', 0xbf9a5e, 4, ribbon(line, rd.w + 14, Y.dirtEdge));
    put('dirt', 0xd9b67c, 5, ribbon(line, rd.w, Y.dirt));
  }
  // Plätze: Stadtplatz mit Pflasterringen, Industrie und Hafen mit Beton
  map.plazas.forEach((p, i) => {
    if (i === 0) {
      put('curb', 0x9ba3ae, 7, ring(p.x, p.y, p.r, p.r + 26, Y.curb));
      put('plaza', 0xe2d6bc, 6, disc(p.x, p.y, p.r, Y.plaza, 96));
      for (let r = 90; r < p.r - 20; r += 55) put('plazaLine', 0xcbbd9e, 8, ring(p.x, p.y, r, r + 5, Y.plaza + 0.002));
    } else put('concrete', 0xc4c8ce, 6, disc(p.x, p.y, p.r, Y.plaza - 0.004, 64));
  });
  // Asphalt: Bordstein (breiter, dunkler), Fahrbahn, gestrichelter Mittelstreifen
  const rg = map.ring;
  put('curb', 0x9ba3ae, 7, ring(rg.x, rg.y, rg.r - rg.w / 2 - 12, rg.r + rg.w / 2 + 12, Y.curb, 160));
  put('road', 0x7f8794, 9, ring(rg.x, rg.y, rg.r - rg.w / 2, rg.r + rg.w / 2, Y.road, 160));
  {
    const n = Math.floor((Math.PI * 2 * rg.r) / 110);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      put('line', 0xffffff, 10, rect(rg.x + Math.cos(a) * rg.r, rg.y + Math.sin(a) * rg.r, 55, 7, Y.line, 0, a + Math.PI / 2));
    }
  }
  for (const rd of map.roads) {
    if (rd.dirt) continue;
    const line = smooth(rd.pts, 30);
    put('curb', 0x9ba3ae, 7, ribbon(line, rd.w + 24, Y.curb));
    put('road', 0x7f8794, 9, ribbon(line, rd.w, Y.road));
    put('line', 0xffffff, 10, dashes(line, Y.line));
  }

  const meshes: THREE.Mesh[] = [], dispose: THREE.BufferGeometry[] = [];
  for (const l of layers.values()) {
    const g = mergeGeometries(l.geos, false);
    l.geos.forEach((x) => x.dispose());
    if (!g) continue;
    g.computeVertexNormals();
    // alle Normalen nach oben (flache Flächen, gleichmäßiges Licht)
    const nn = g.getAttribute('normal');
    for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
    const m = new THREE.Mesh(g, mat(l.c, l.lift));
    m.receiveShadow = true;
    m.renderOrder = 0;
    meshes.push(m);
    dispose.push(g);
  }
  return { meshes, dispose };
}
