const BASE = [
  'Blitz', 'Krümel', 'NoScope', 'Pixel', 'Turbo', 'Shadow', 'Kobra', 'Funky', 'Nebel', 'Panda',
  'Wirbel', 'Glitch', 'Hai', 'Falke', 'Ninja', 'Donner', 'Keks', 'Viper', 'Bolt', 'Mango',
  'Frost', 'Joker', 'Ronin', 'Spike', 'Tiger', 'Wolf', 'Komet', 'Dusty', 'Echo', 'Laser',
  'Brezel', 'Rakete', 'Zack', 'Fuchs', 'Gecko', 'Orbit',
];

export function botNames(count: number): string[] {
  const pool = [...BASE].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => {
    const n = pool[i % pool.length];
    return Math.random() < 0.45 ? `${n}${Math.floor(Math.random() * 99) + 1}` : n;
  });
}

export const BODY_COLORS = [
  0xe74c3c, 0x3498db, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xff6b9d, 0x95a5a6, 0x2ecc71,
  0x5d6d7e, 0xf39c12, 0x8e44ad, 0x16a085, 0xc0392b, 0x2980b9, 0xd35400, 0x27ae60,
];

export const PLAYER_COLOR = 0xffd23f;
