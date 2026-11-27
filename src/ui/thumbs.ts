import * as THREE from 'three';
import { buildCharacter, buildChute, makeToon, animateRig, CharKind, ChuteKind, Outfit } from '../render/character';
import { animateEmote, EmoteId } from '../render/emotes';
import { plushData } from '../render/plush';
import type { ChuteDesign } from '../chute';

/** Vorschaubilder für die Spind-Karten (ein gemeinsamer kleiner Renderer, Bilder werden zwischengespeichert) */
let gl: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene, gradient: THREE.DataTexture, toon: (c: number) => THREE.MeshToonMaterial;
const cache = new Map<string, string>();
const W = 180, H = 220;

function setup() {
  gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  gl.setSize(W, H, false);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(4, 5, 3);
  scene.add(sun);
  gradient = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  toon = makeToon(gradient);
}

const isPlush = (k: CharKind) => k === 'jackal' || k === 'luchador';

function snap(obj: THREE.Object3D, cam: THREE.Camera, key: string, keep: boolean) {
  scene.add(obj);
  gl!.render(scene, cam);
  const url = gl!.domElement.toDataURL('image/png');
  scene.remove(obj);
  if (keep) cache.set(key, url);
  return url;
}

/** ganze Figur von schräg vorne, optional in einer Emote-Pose */
export function fullBody(kind: CharKind, color: number, outfit: Outfit = 'none', emote: EmoteId | null = null): string {
  const key = ['body', kind, color, outfit, emote].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    if (!gl) setup();
    const rig = buildCharacter({ kind, shirt: color, seed: 3, gradient, toon, outfit });
    rig.body.rotation.y = -Math.PI / 2 + 0.45;
    if (emote) animateEmote(rig, emote, emote === 'huepfen' ? 0.5 : 0.35);
    else animateRig(rig, { phase: 0, amp: 0, aim: 0, twoHanded: false, weapon: 'fists', reload: 0, time: 0.3, falling: false });
    const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    cam.position.set(0, 1.9, 7.2);
    cam.lookAt(0, 1.35, 0);
    const url = snap(rig.body, cam, key, !isPlush(kind) || !!plushData(kind as 'jackal' | 'luchador'));
    rig.mats.forEach((m) => m.dispose());
    return url;
  } catch {
    return '';
  }
}

/** Fallschirm von schräg unten (zeigt Form und Muster) */
export function chuteThumb(kind: ChuteKind, d: ChuteDesign): string {
  const key = ['chute', kind, JSON.stringify(d)].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    if (!gl) setup();
    const line = new THREE.LineBasicMaterial({ color: 0x4a4a4a });
    const c = buildChute(kind, d, gradient, line);
    const g = new THREE.Group();
    g.add(c.chute);
    g.rotation.y = 0.5;
    const cam = new THREE.PerspectiveCamera(34, W / H, 0.1, 80);
    cam.position.set(0, 8.2, 8.0);
    cam.lookAt(0, kind === 'round' ? 3.9 : 3.6, 0);
    const url = snap(g, cam, key, true);
    c.disposables.forEach((x) => x.dispose());
    line.dispose();
    return url;
  } catch {
    return '';
  }
}
