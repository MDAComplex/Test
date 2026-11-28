const BASE = [
  'Blitz', 'Krümel', 'NoScope', 'Pixel', 'Turbo', 'Shadow', 'Kobra', 'Funky', 'Nebel', 'Panda',
  'Wirbel', 'Glitch', 'Hai', 'Falke', 'Ninja', 'Donner', 'Keks', 'Viper', 'Bolt', 'Mango',
  'Frost', 'Joker', 'Ronin', 'Spike', 'Tiger', 'Wolf', 'Komet', 'Dusty', 'Echo', 'Laser',
  'Brezel', 'Rakete', 'Zack', 'Fuchs', 'Gecko', 'Orbit',
  'Nova', 'Quasar', 'Pixie', 'Rocket', 'Sparky', 'Blaze', 'Storm', 'Raven', 'Cobalt', 'Ember',
  'Jinx', 'Nitro', 'Pogo', 'Rusty', 'Sly', 'Taco', 'Waffle', 'Yeti', 'Ziggy', 'Bandit',
  'Comet', 'Drift', 'Fizz', 'Gizmo', 'Hopper', 'Kiwi', 'Lucky', 'Muffin', 'Nacho', 'Otto',
];

export function botNames(count: number): string[] {
  const pool = [...BASE].sort(() => Math.random() - 0.5);
  const used = new Set<string>();
  return Array.from({ length: count }, (_, i) => {
    const n = pool[i % pool.length];
    let name = i < pool.length && Math.random() >= 0.45 ? n : `${n}${Math.floor(Math.random() * 99) + 1}`;
    while (used.has(name)) name = `${n}${Math.floor(Math.random() * 999) + 1}`;
    used.add(name);
    return name;
  });
}

export const BODY_COLORS = [
  0xe74c3c, 0x3498db, 0x9b59b6, 0x1abc9c, 0xe67e22, 0xff6b9d, 0x95a5a6, 0x2ecc71,
  0x5d6d7e, 0xf39c12, 0x8e44ad, 0x16a085, 0xc0392b, 0x2980b9, 0xd35400, 0x27ae60,
];

export const PLAYER_COLOR = 0xffd23f;
