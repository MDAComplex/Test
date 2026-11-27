import type { Rig } from './character';

/** Sieges-Emotes: kurze Animationen in Schleife (Siegesbildschirm und Spind-Vorschau) */
export type EmoteId = 'jubel' | 'flex' | 'winken' | 'verbeugung' | 'disco' | 'huepfen' | 'roboter' | 'dab';
export interface EmoteDef { id: EmoteId; name: string; rarity: 1 | 3 | 4 | 5; level: number }

export const EMOTES: EmoteDef[] = [
  { id: 'jubel', name: 'Jubeln', rarity: 1, level: 1 },
  { id: 'flex', name: 'Flex', rarity: 1, level: 1 },
  { id: 'winken', name: 'Winken', rarity: 1, level: 1 },
  { id: 'verbeugung', name: 'Verbeugung', rarity: 3, level: 3 },
  { id: 'disco', name: 'Disco', rarity: 3, level: 5 },
  { id: 'huepfen', name: 'Freudensprung', rarity: 4, level: 8 },
  { id: 'roboter', name: 'Roboter', rarity: 4, level: 12 },
  { id: 'dab', name: 'Dab', rarity: 5, level: 18 },
];
export const RARITY_LABEL: Record<number, string> = { 1: 'Normal', 3: 'Selten', 4: 'Episch', 5: 'Legendär' };

const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.min(1, Math.max(0, x)) * Math.PI);

/** Emote-Pose zum Zeitpunkt t (Sekunden) */
export function animateEmote(rig: Rig, e: EmoteId, t: number) {
  const [R, L] = rig.arms;
  rig.gunPivot.visible = false;
  rig.body.scale.set(1, 1, 1);
  rig.body.rotation.x = 0; rig.body.rotation.z = 0;
  rig.body.position.set(0, 0, 0);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.torso.rotation.set(0, 0, 0);
  rig.torso.position.y = (rig.torsoY ?? 1.0) + Math.sin(t * 2.2) * 0.012;
  rig.head.rotation.set(0, 0, 0);
  rig.legs.forEach((l) => { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); });
  for (const a of rig.arms) {
    const r = a.shoulder.userData.rest;
    if (r) a.shoulder.position.copy(r);
    a.shoulder.rotation.set(0, 0, 0); a.elbow.rotation.set(0, 0, 0);
  }
  switch (e) {
    case 'jubel': {
      // Arme hoch, im Takt pumpen, leicht hüpfen
      const b = Math.abs(Math.sin(t * 5.5));
      R.shoulder.rotation.set(-2.45 - b * 0.25, 0, 0.3); L.shoulder.rotation.set(2.45 + b * 0.25, 0, 0.3);
      R.elbow.rotation.x = -0.25 - b * 0.3; L.elbow.rotation.x = 0.25 + b * 0.3;
      rig.body.position.y = b * 0.14;
      rig.legs.forEach((l) => { l.hip.rotation.z = 0.25 * (1 - b); l.knee.rotation.z = -0.5 * (1 - b); });
      rig.head.rotation.z = 0.2 + b * 0.1;
      break;
    }
    case 'flex': {
      // Bizeps zeigen, abwechselnd stärker anspannen, Oberkörper dreht mit
      const k = Math.sin(t * 3);
      R.shoulder.rotation.set(-1.45, 0, 0.15); L.shoulder.rotation.set(1.45, 0, 0.15);
      R.elbow.rotation.x = -1.5 - Math.max(0, k) * 0.45; L.elbow.rotation.x = 1.5 + Math.max(0, -k) * 0.45;
      rig.torso.rotation.set(0, k * 0.22, -0.08);
      rig.head.rotation.y = -k * 0.15;
      rig.legs[0].hip.rotation.x = -0.18; rig.legs[1].hip.rotation.x = 0.18;
      rig.body.position.y = Math.abs(k) * 0.03;
      break;
    }
    case 'winken': {
      R.shoulder.rotation.set(-2.25, 0, 0.2);
      R.elbow.rotation.x = -0.45 + Math.sin(t * 9) * 0.45;
      L.elbow.rotation.z = 0.3;
      rig.head.rotation.set(-0.12, 0, 0.08 + Math.sin(t * 2) * 0.05);
      rig.torso.rotation.x = Math.sin(t * 2) * 0.05;
      break;
    }
    case 'verbeugung': {
      // langsam verbeugen, kurz halten, wieder aufrichten
      const c = (t % 2.6) / 2.6;
      const k = c < 0.35 ? ease(c / 0.35) : c < 0.65 ? 1 : 1 - ease((c - 0.65) / 0.35);
      rig.torso.rotation.z = -0.8 * k;
      rig.head.rotation.z = -0.35 * k;
      R.shoulder.rotation.set(0, 0, 0.9 * k); R.elbow.rotation.z = 1.4 * k + 0.2;
      L.shoulder.rotation.set(0.35, 0, -0.5 * k);
      rig.legs[0].hip.rotation.z = 0.15 * k;
      break;
    }
    case 'disco': {
      // Disco-Zeigen: alle halbe Sekunde rechte Hand hoch zur Seite / runter über die Brust
      const beat = Math.floor(t * 2) % 2, f = ease((t * 2) % 1 * 2.5);
      const up = beat === 0 ? f : 1 - f;
      R.shoulder.rotation.set(-0.4 - 2.0 * up, 0, 0.5 + 0.4 * up); R.elbow.rotation.z = 0.15 + (1 - up) * 0.9;
      L.shoulder.rotation.set(0.35, 0, 0.6); L.elbow.rotation.z = 1.2;
      rig.pelvis.rotation.y = (up - 0.5) * 0.4;
      rig.torso.rotation.set((up - 0.5) * 0.25, -(up - 0.5) * 0.3, 0);
      rig.legs[0].hip.rotation.set(-0.25 * up, 0, 0.2 * up); rig.legs[0].knee.rotation.z = -0.5 * up;
      rig.head.rotation.set(0.15 * up, 0, 0.1);
      rig.body.position.y = Math.abs(Math.sin(t * Math.PI * 2)) * 0.05;
      break;
    }
    case 'huepfen': {
      // Freudensprung: ausholen, hoch springen mit angezogenen Beinen, landen
      const c = (t % 1.1) / 1.1;
      const air = c > 0.2 && c < 0.75 ? Math.sin(((c - 0.2) / 0.55) * Math.PI) : 0;
      const crouch = c < 0.2 ? ease(c / 0.2) : c > 0.75 ? 1 - ease((c - 0.75) / 0.25) : 0;
      rig.body.position.y = air * 0.7 - crouch * 0.18;
      rig.legs.forEach((l, i) => { l.hip.rotation.set(i ? 0.2 * air : -0.2 * air, 0, 0.9 * air + 0.5 * crouch); l.knee.rotation.z = -1.6 * air - 0.9 * crouch; });
      R.shoulder.rotation.set(-0.3 - 2.6 * air, 0, 0.2 - 0.4 * crouch); L.shoulder.rotation.set(0.3 + 2.6 * air, 0, 0.2 - 0.4 * crouch);
      R.elbow.rotation.x = -0.3 * air; L.elbow.rotation.x = 0.3 * air;
      rig.head.rotation.z = 0.25 * air - 0.15 * crouch;
      rig.body.scale.set(1 + crouch * 0.08, 1 - crouch * 0.1, 1 + crouch * 0.08);
      break;
    }
    case 'roboter': {
      // ruckartig zwischen festen Posen wechseln
      const step = Math.floor(t * 2.5) % 4;
      const P = [
        { r: [0, 0, 1.55], re: 1.55, l: [0, 0, 0], le: 1.55, h: 0.5, ty: -0.2 },
        { r: [0, 0, 0], re: 1.55, l: [0, 0, 1.55], le: 1.55, h: -0.5, ty: 0.2 },
        { r: [-1.55, 0, 0], re: 0, l: [1.55, 0, 0], le: 0, h: 0, ty: 0 },
        { r: [0, 0, 1.55], re: 0, l: [0, 0, 1.55], le: 0, h: 0.3, ty: 0 },
      ][step];
      R.shoulder.rotation.set(P.r[0], P.r[1], P.r[2]); R.elbow.rotation.z = P.re;
      L.shoulder.rotation.set(P.l[0], P.l[1], P.l[2]); L.elbow.rotation.z = P.le;
      rig.head.rotation.y = P.h; rig.torso.rotation.y = P.ty;
      rig.body.position.y = step % 2 ? 0.02 : 0;
      break;
    }
    case 'dab': {
      // Dab, kurz halten, dann neu ansetzen
      const c = (t % 1.6) / 1.6;
      const k = c < 0.15 ? ease(c / 0.15) : c < 0.8 ? 1 : 1 - ease((c - 0.8) / 0.2);
      R.shoulder.rotation.set(-2.3 * k, 0, 0.6 * k); R.elbow.rotation.z = 0;
      L.shoulder.rotation.set(-0.4 * k, 0, 1.6 * k); L.elbow.rotation.z = 2.2 * k;
      rig.head.rotation.set(-0.45 * k, 0, -0.6 * k);
      rig.torso.rotation.z = -0.2 * k;
      rig.legs[1].hip.rotation.x = 0.15 * k;
      break;
    }
  }
}
