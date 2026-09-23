import { defineConfig } from 'vite';
import importMetaUrlPlugin from '@codingame/esbuild-import-meta-url-plugin';

// VS Code css must load as strings so it can be injected into the shadow root.
// NOTE: Windows paths use backslashes — normalize before matching (upstream regex assumes posix).
const loadVscodeCssAsString = {
  name: 'load-vscode-css-as-string',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    const resolved = await this.resolve(source, importer, options);
    if (resolved && resolved.id.replace(/\\/g, '/').match(/node_modules\/(@codingame\/monaco-vscode|vscode|monaco-editor).*\.css$/)) {
      return { ...resolved, id: resolved.id + '?inline' };
    }
    return null;
  }
};

// Served from /studio/ by server.js (static public/ dir)
export default defineConfig({
  base: '/studio/',
  plugins: [loadVscodeCssAsString],
  worker: {
    format: 'es'
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [importMetaUrlPlugin]
    }
  },
  build: {
    // Modern Chrome only (school machines run current Chrome/Edge) — enables top-level await
    target: 'esnext',
    outDir: '../public/studio',
    emptyOutDir: true,
    chunkSizeWarningLimit: 20000
  }
});
