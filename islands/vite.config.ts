import { defineConfig } from 'vite';
import path from 'path';

// React islands for classic pages: one IIFE bundle, mounted by
// data-island containers. Output is committed (like public/_next) so
// Vercel needs no build change. Rebuild after editing src/.
export default defineConfig({
  // No process shim in browsers: pin prod branches at build time so
  // dev-only requires (react-dom, scheduler) are eliminated, not runtime.
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: '../public/islands',
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/loader.ts'),
      name: 'CudicIslands',
      fileName: () => 'islands.js',
      formats: ['iife'],
    },
    target: 'es2020',
    chunkSizeWarningLimit: 500,
  },
});
