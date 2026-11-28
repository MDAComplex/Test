/** Waffenlackierungen: färben nur die Lackflächen der Waffe (nicht Visier, Leuchtstreifen, Seltenheitsfarbe) */
export type WrapId = 'none' | 'jungle' | 'arctic' | 'desert' | 'carbon' | 'candy' | 'neon' | 'lava' | 'galaxy';
export interface WrapDef { id: WrapId; name: string; level: number; rarity: 1 | 2 | 3 | 4 | 5 }
export const WRAPS: WrapDef[] = [
  { id: 'none', name: 'Standard', level: 1, rarity: 1 },
  { id: 'jungle', name: 'Dschungel', level: 2, rarity: 2 },
  { id: 'arctic', name: 'Arktis', level: 4, rarity: 2 },
  { id: 'desert', name: 'Wüste', level: 6, rarity: 2 },
  { id: 'carbon', name: 'Carbon', level: 9, rarity: 3 },
  { id: 'candy', name: 'Zuckerstange', level: 11, rarity: 3 },
  { id: 'neon', name: 'Neon', level: 14, rarity: 4 },
  { id: 'lava', name: 'Lava', level: 17, rarity: 4 },
  { id: 'galaxy', name: 'Galaxie', level: 20, rarity: 5 },
];
