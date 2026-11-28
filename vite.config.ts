import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // 3D-Modelle (Plüsch-Figuren) als Assets; mit ?inline landen sie direkt im Bundle
  assetsInclude: ['**/*.glb'],
  build: { chunkSizeWarningLimit: 3000, assetsInlineLimit: 1_000_000 },
});
