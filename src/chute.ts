/** Aussehen des Fallschirms (im Spind einstellbar) */
export type ChuteLogo = 'none' | 'star' | 'heart' | 'bolt' | 'skull' | 'crown';
export type ChutePattern = 'bahnen' | 'uni' | 'ringe' | 'karo' | 'punkte' | 'zickzack' | 'verlauf' | 'flammen' | 'tarn' | 'sterne';
export interface ChuteDesign { color: number; accent: number; logo: ChuteLogo; text: string; pattern?: ChutePattern }

/** Standard: weißer Schirm mit hellgrauen Bahnen */
export const WHITE_CHUTE: ChuteDesign = { color: 0xffffff, accent: 0xe3e7ec, logo: 'none', text: '', pattern: 'bahnen' };

/** Muster für den Schirm, mit Level zum Freischalten */
export const CHUTE_PATTERNS: { id: ChutePattern; name: string; level: number }[] = [
  { id: 'bahnen', name: 'Bahnen', level: 1 }, { id: 'uni', name: 'Uni', level: 1 }, { id: 'ringe', name: 'Ringe', level: 2 },
  { id: 'karo', name: 'Karo', level: 3 }, { id: 'punkte', name: 'Punkte', level: 4 }, { id: 'zickzack', name: 'Zickzack', level: 6 },
  { id: 'verlauf', name: 'Verlauf', level: 8 }, { id: 'tarn', name: 'Tarnung', level: 10 }, { id: 'flammen', name: 'Flammen', level: 13 },
  { id: 'sterne', name: 'Sternenhimmel', level: 16 },
];

export const CHUTE_COLORS = [0xffffff, 0xe3e7ec, 0xff5a4e, 0xff9a2e, 0xffc93c, 0x43c463, 0x3d8cf0, 0x9b6bff, 0xff8fb1, 0x30333a];
export const CHUTE_LOGOS: { id: ChuteLogo; name: string }[] = [
  { id: 'none', name: 'Keins' }, { id: 'star', name: 'Stern' }, { id: 'heart', name: 'Herz' },
  { id: 'bolt', name: 'Blitz' }, { id: 'skull', name: 'Totenkopf' }, { id: 'crown', name: 'Krone' },
];
