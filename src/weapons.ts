export type WeaponId = 'fists' | 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper' | 'minigun' | 'rocket';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  damage: number;
  rate: number; // ms zwischen Schüssen
  range: number;
  speed: number;
  spread: number;
  mag: number;
  reload: number;
  pellets: number;
  tier: number;
  length: number;
  /** Laufgeschwindigkeits-Faktor */
  moveMul: number;
  twoHanded: boolean;
  /** Explosionsradius (nur Raketenwerfer) */
  splash?: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  // Start ohne Waffe: Nahkampf mit den Fäusten
  fists: { id: 'fists', name: 'Fäuste', damage: 18, rate: 420, range: 46, speed: 0, spread: 0, mag: 0, reload: 0, pellets: 0, tier: 0, length: 0, moveMul: 1.04, twoHanded: false },
  pistol: { id: 'pistol', name: 'Pistole', damage: 16.15, rate: 380, range: 315, speed: 950, spread: 0.05, mag: 12, reload: 1100, pellets: 1, tier: 1, length: 20 , moveMul: 1.0, twoHanded: false },
  smg: { id: 'smg', name: 'Maschinenpistole', damage: 7.65, rate: 105, range: 297, speed: 1000, spread: 0.13, mag: 30, reload: 1500, pellets: 1, tier: 2, length: 26 , moveMul: 0.96, twoHanded: true },
  shotgun: { id: 'shotgun', name: 'Schrotflinte', damage: 8.5, rate: 850, range: 230, speed: 900, spread: 0.3, mag: 5, reload: 1900, pellets: 6, tier: 2, length: 30 , moveMul: 0.92, twoHanded: true },
  rifle: { id: 'rifle', name: 'Sturmgewehr', damage: 11.9, rate: 150, range: 405, speed: 1150, spread: 0.06, mag: 25, reload: 1700, pellets: 1, tier: 3, length: 34 , moveMul: 0.9, twoHanded: true },
  sniper: { id: 'sniper', name: 'Scharfschützengewehr', damage: 63.75, rate: 1300, range: 639, speed: 1700, spread: 0, mag: 4, reload: 2300, pellets: 1, tier: 4, length: 42 , moveMul: 0.84, twoHanded: true },
  minigun: { id: 'minigun', name: 'Minigun', damage: 5.95, rate: 55, range: 378, speed: 1250, spread: 0.11, mag: 150, reload: 3600, pellets: 1, tier: 5, length: 40, moveMul: 0.72, twoHanded: true },
  rocket: { id: 'rocket', name: 'Raketenwerfer', damage: 63.75, rate: 1500, range: 378, speed: 620, spread: 0.02, mag: 1, reload: 2400, pellets: 1, tier: 5, length: 44, moveMul: 0.8, twoHanded: true, splash: 120 },
};

/** Seltenheit: 1 Grau, 2 Grün, 3 Blau, 4 Lila (episch), 5 Gold (legendär) */
export type Rarity = 1 | 2 | 3 | 4 | 5;
export const TIER_COLORS: Record<number, number> = { 0: 0xdddddd, 1: 0xbfc5cc, 2: 0x5fd068, 3: 0x45a3ff, 4: 0xb35cff, 5: 0xffc233 };
export const RARITY_NAMES: Record<number, string> = { 0: '', 1: 'Gewöhnlich', 2: 'Ungewöhnlich', 3: 'Selten', 4: 'Episch', 5: 'Legendär' };
/** Schaden je Seltenheit (Grundwerte oben gelten für Blau) */
export const DMG_MUL: Record<number, number> = { 0: 1, 1: 0.82, 2: 0.91, 3: 1, 4: 1.1, 5: 1.22 };
/** grobe Stärke der Waffenart, für Bots und Vergleiche */
const TYPE_RANK: Record<WeaponId, number> = { fists: 0, pistol: 1, smg: 2, shotgun: 2.1, rifle: 3, sniper: 3, minigun: 5, rocket: 5 };

export type GunId = Exclude<WeaponId, 'fists'>;
export type WeaponLoot = `w:${GunId}:${Rarity}`;

const cache = new Map<string, WeaponDef>();
/** Waffe in bestimmter Seltenheit (gecacht, damit Vergleiche per Referenz klappen) */
export function weaponOf(id: WeaponId, rarity: number): WeaponDef {
  if (id === 'fists') return WEAPONS.fists;
  const key = id + rarity;
  let w = cache.get(key);
  if (!w) {
    const b = WEAPONS[id];
    // Minigun und Raketenwerfer: Grundwerte gelten für Lila
    const mul = b.tier === 5 ? DMG_MUL[rarity] / DMG_MUL[4] : DMG_MUL[rarity];
    w = { ...b, tier: rarity, damage: Math.round(b.damage * mul * 10) / 10, reload: Math.round(b.reload * (1 - (rarity - 1) * 0.03)) };
    cache.set(key, w);
  }
  return w;
}

export const wKind = (id: WeaponId, rarity: number) => `w:${id}:${rarity}` as WeaponLoot;
export function parseWeapon(k: string): WeaponDef {
  const [, id, r] = k.split(':');
  return weaponOf(id as WeaponId, Number(r) || WEAPONS[id as WeaponId].tier);
}
export const weaponScore = (w: WeaponDef) => (w.id === 'fists' ? 0 : TYPE_RANK[w.id] + (w.tier - 1) * 0.55);

/** Seltenheit würfeln: Gewichte für Grau..Gold */
export function rollRarity(r: () => number, weights: [number, number, number, number, number]): Rarity {
  const sum = weights.reduce((a, b) => a + b, 0);
  let v = r() * sum;
  for (let i = 0; i < 5; i++) { v -= weights[i]; if (v < 0) return (i + 1) as Rarity; }
  return 1;
}
/** Boden-Loot: ca. 5 % Gold */
export const GROUND_RARITY: [number, number, number, number, number] = [36, 30, 19, 10, 5];
export const CRATE_RARITY: [number, number, number, number, number] = [24, 32, 24, 14, 6];
export const CHEST_RARITY: [number, number, number, number, number] = [12, 30, 32, 19, 7];
