import * as THREE from 'three';
import { buildCharacter, makeToon, CharKind, Outfit } from '../render/character';

/** kleine Profilbilder (Kopf und Schultern) der Figuren, mit einem gemeinsamen Renderer */
let gl: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene, cam: THREE.PerspectiveCamera, gradient: THREE.DataTexture, toon: (c: number) => THREE.MeshToonMaterial;
const cache = new Map<string, string>();

function setup() {
  gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  gl.setSize(96, 96, false);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(3, 4, 2);
  scene.add(sun);
  cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  gradient = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  toon = makeToon(gradient);
}

export function portrait(kind: CharKind, color: number, seed: number, outfit: Outfit = 'none'): string {
  const key = [kind, color, seed, outfit].join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    if (!gl) setup();
    const rig = buildCharacter({ kind, shirt: color, seed, gradient, toon, outfit });
    scene.add(rig.body);
    rig.body.updateMatrixWorld(true);
    // Kopf finden und die Kamera schräg von vorne darauf richten
    const head = new THREE.Vector3();
    rig.head.getWorldPosition(head);
    cam.position.set(head.x + 2.3, head.y + 0.15, head.z + 0.9);
    cam.lookAt(head.x, head.y - 0.22, head.z);
    gl!.render(scene, cam);
    const url = gl!.domElement.toDataURL('image/png');
    scene.remove(rig.body);
    rig.mats.forEach((m) => m.dispose());
    cache.set(key, url);
    return url;
  } catch {
    return '';
  }
}
