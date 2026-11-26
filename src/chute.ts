/** Aussehen des Fallschirms (im Spind einstellbar) */
export type ChuteLogo = 'none' | 'star' | 'heart' | 'bolt' | 'skull' | 'crown';
export interface ChuteDesign { color: number; accent: number; logo: ChuteLogo; text: string }

/** Standard: weißer Schirm mit hellgrauen Bahnen */
export const WHITE_CHUTE: ChuteDesign = { color: 0xffffff, accent: 0xe3e7ec, logo: 'none', text: '' };

export const CHUTE_COLORS = [0xffffff, 0xe3e7ec, 0xff5a4e, 0xff9a2e, 0xffc93c, 0x43c463, 0x3d8cf0, 0x9b6bff, 0xff8fb1, 0x30333a];
export const CHUTE_LOGOS: { id: ChuteLogo; name: string }[] = [
  { id: 'none', name: 'Keins' }, { id: 'star', name: 'Stern' }, { id: 'heart', name: 'Herz' },
  { id: 'bolt', name: 'Blitz' }, { id: 'skull', name: 'Totenkopf' }, { id: 'crown', name: 'Krone' },
];
