import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// SSR build used only to prerender public/404.html. Runs after the client
// build; copy-404.mjs injects the markup into the built html and writes the
// final page to public/404.html.
export default defineConfig({
  plugins: [react()],
  build: {
    ssr: "src/entry-404-server.tsx",
    outDir: "dist-404-server",
    emptyOutDir: true,
    target: "esnext",
  },
  ssr: {
    noExternal: ["motion"],
  },
});
