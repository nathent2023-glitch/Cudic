import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Landing builds to public/landing-assets (gitignored). The prerender step
// writes public/index.html referencing those hashed assets. Nothing else in
// public/ is touched — other pages keep working exactly as before.
export default defineConfig({
  base: '/landing-assets/',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'esnext',
    outDir: '../public/landing-assets',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  ssr: {
    noExternal: ['motion'],
  },
});
