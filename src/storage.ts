const KEY = 'zonerush.stats.v1';

export interface Stats { games: number; wins: number; best: number; kills: number }

const empty = (): Stats => ({ games: 0, wins: 0, best: 0, kills: 0 });

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch { /* Speicher nicht verfügbar */ }
  return empty();
}

export function recordResult(place: number, kills: number, win: boolean): Stats {
  const s = loadStats();
  s.games++;
  if (win) s.wins++;
  s.best = s.best ? Math.min(s.best, place) : place;
  s.kills += kills;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignorieren */ }
  return s;
}
