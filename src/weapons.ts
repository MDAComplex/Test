export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'sniper';

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
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: { id: 'pistol', name: 'Pistole', damage: 15, rate: 380, range: 400, speed: 950, spread: 0.05, mag: 12, reload: 1100, pellets: 1, tier: 1, length: 20 },
  smg: { id: 'smg', name: 'Maschinenpistole', damage: 9, rate: 105, range: 380, speed: 1000, spread: 0.13, mag: 30, reload: 1500, pellets: 1, tier: 2, length: 26 },
  shotgun: { id: 'shotgun', name: 'Schrotflinte', damage: 10, rate: 850, range: 280, speed: 900, spread: 0.3, mag: 5, reload: 1900, pellets: 6, tier: 2, length: 30 },
  rifle: { id: 'rifle', name: 'Sturmgewehr', damage: 14, rate: 150, range: 500, speed: 1150, spread: 0.06, mag: 25, reload: 1700, pellets: 1, tier: 3, length: 34 },
  sniper: { id: 'sniper', name: 'Scharfschützengewehr', damage: 75, rate: 1300, range: 760, speed: 1700, spread: 0, mag: 4, reload: 2300, pellets: 1, tier: 4, length: 42 },
};

export const TIER_COLORS: Record<number, number> = { 1: 0xbfc5cc, 2: 0x5fd068, 3: 0x45a3ff, 4: 0xc070ff };
