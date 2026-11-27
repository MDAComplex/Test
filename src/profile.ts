import { ChuteDesign, WHITE_CHUTE } from './chute';
/** Spielerprofil: Erfahrung, Level, Skins, tägliche Aufgaben (im Browser gespeichert) */

const KEY = 'zonerush.profile.v1';

export interface Skin { id: string; name: string; color: number; level: number }
export const SKINS: Skin[] = [
  { id: 'gelb', name: 'Sonne', color: 0xffd23f, level: 1 },
  { id: 'rot', name: 'Feuer', color: 0xff5a4e, level: 2 },
  { id: 'blau', name: 'Ozean', color: 0x3d8cf0, level: 3 },
  { id: 'gruen', name: 'Wald', color: 0x43c463, level: 4 },
  { id: 'lila', name: 'Nebel', color: 0x9b6bff, level: 5 },
  { id: 'orange', name: 'Kürbis', color: 0xff9a2e, level: 7 },
  { id: 'weiss', name: 'Schnee', color: 0xf2f4f7, level: 9 },
  { id: 'schwarz', name: 'Schatten', color: 0x30333a, level: 12 },
  { id: 'gold', name: 'Gold', color: 0xffc21a, level: 15 },
];

export type TaskKind = 'kills' | 'chests' | 'top10' | 'survive' | 'shields' | 'win' | 'airdrop';
export interface Task { kind: TaskKind; target: number; progress: number; done: boolean }
const TASKS: { kind: TaskKind; target: number }[] = [
  { kind: 'kills', target: 5 },
  { kind: 'chests', target: 3 },
  { kind: 'top10', target: 3 },
  { kind: 'survive', target: 480 },
  { kind: 'shields', target: 4 },
  { kind: 'win', target: 1 },
  { kind: 'airdrop', target: 1 },
];
export const TASK_XP = 250;

export function taskText(t: Task) {
  switch (t.kind) {
    case 'kills': return `Erziele ${t.target} Abschüsse`;
    case 'chests': return `Öffne ${t.target} Loot-Kisten`;
    case 'top10': return `Erreiche ${t.target}-mal die Top 10`;
    case 'survive': return `Überlebe insgesamt ${Math.round(t.target / 60)} Minuten`;
    case 'shields': return `Hebe ${t.target} Schilde auf`;
    case 'win': return 'Gewinne eine Runde';
    case 'airdrop': return 'Öffne ein Versorgungspaket';
  }
}

export interface Profile {
  xp: number;
  skin: string;
  /** Figur und Fallschirm aus dem Spind */
  char: 'man' | 'woman' | 'jackal' | 'luchador';
  chute: 'round' | 'wing';
  /** Outfit (Skin-Modell) aus dem Spind */
  outfit: 'none' | 'astronaut' | 'skeleton' | 'office' | 'jogger';
  /** eigenes Fallschirm-Design */
  chuteDesign: ChuteDesign;
  tutorialDone: boolean;
  daily: { date: string; tasks: Task[] };
}

const today = () => new Date().toISOString().slice(0, 10);

function newDaily(date: string): Profile['daily'] {
  // drei Aufgaben, aus dem Datum abgeleitet
  let seed = 0;
  for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = [...TASKS];
  const tasks: Task[] = [];
  for (let i = 0; i < 3; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const t = pool.splice(seed % pool.length, 1)[0];
    tasks.push({ ...t, progress: 0, done: false });
  }
  return { date, tasks };
}

export function loadProfile(): Profile {
  let p: Profile = { xp: 0, skin: 'gelb', char: 'man', chute: 'round', outfit: 'none', chuteDesign: { ...WHITE_CHUTE }, tutorialDone: false, daily: newDaily(today()) };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) p = { ...p, ...JSON.parse(raw) };
    p.chuteDesign = { ...WHITE_CHUTE, ...(p.chuteDesign || {}) };
  } catch { /* Speicher nicht verfügbar */ }
  if (p.daily?.date !== today()) p.daily = newDaily(today());
  return p;
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignorieren */ }
}

/** Level aus Erfahrung: jedes Level braucht 300 XP mehr als das vorige */
export function levelInfo(xp: number) {
  let level = 1, need = 300, rest = xp;
  while (rest >= need) { rest -= need; level++; need = 300 + (level - 1) * 150; }
  return { level, into: rest, need };
}

export function skinColor(p: Profile) {
  return (SKINS.find((s) => s.id === p.skin) ?? SKINS[0]).color;
}

export interface RoundSummary { place: number; kills: number; win: boolean; seconds: number; chests: number; airdrops: number; shields: number }
export interface RoundReward { xp: number; lines: string[]; levelBefore: number; levelAfter: number; tasksDone: string[] }

export function awardRound(p: Profile, r: RoundSummary): RoundReward {
  const levelBefore = levelInfo(p.xp).level;
  const lines: string[] = [];
  const add = (label: string, xp: number) => { if (xp > 0) { lines.push(`${label}  +${xp}`); total += xp; } };
  let total = 0;
  add('Platzierung', Math.max(0, 26 - r.place) * 10);
  add('Abschüsse', r.kills * 60);
  add('Kisten', (r.chests + r.airdrops) * 15);
  add('Überlebt', Math.floor(r.seconds / 10) * 5);
  if (r.win) add('Sieg', 300);
  const tasksDone: string[] = [];
  for (const t of p.daily.tasks) {
    if (t.done) continue;
    const inc: Record<TaskKind, number> = {
      kills: r.kills, chests: r.chests, top10: r.place <= 10 ? 1 : 0, survive: Math.floor(r.seconds),
      shields: r.shields, win: r.win ? 1 : 0, airdrop: r.airdrops,
    };
    t.progress = Math.min(t.target, t.progress + inc[t.kind]);
    if (t.progress >= t.target) {
      t.done = true;
      tasksDone.push(taskText(t));
      add('Aufgabe', TASK_XP);
    }
  }
  p.xp += total;
  saveProfile(p);
  return { xp: total, lines, levelBefore, levelAfter: levelInfo(p.xp).level, tasksDone };
}
