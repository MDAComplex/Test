export interface Settings {
  /** false: links laufen, rechts zielen. true: umgekehrt */
  swap: boolean;
  quality: 'auto' | 'high' | 'low';
  stick: 'small' | 'medium' | 'large';
  sound: boolean;
  mode: 'solo' | 'duo' | 'squad';
  /** Ansicht: von oben oder aus der Ich-Perspektive */
  view: 'top' | 'fpp';
}

const KEY = 'zonerush.settings.v1';
const defaults = (): Settings => ({ swap: false, quality: 'auto', stick: 'medium', sound: true, mode: 'solo', view: 'top' });

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...JSON.parse(raw), view: 'top' };
  } catch { /* Speicher nicht verfügbar */ }
  return defaults();
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignorieren */ }
}
