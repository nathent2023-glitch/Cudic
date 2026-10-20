import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Standalone React 404 page. Shares the landing's React/Tailwind install but
// builds separately so the marketing page and public/index.html are untouched.
// Output: public/404-assets/ (gitignored only for the landing build), then
// copy-404.mjs drops the html at public/404.html, which Vercel serves for
// unknown routes.
export default defineConfig({
  base: "/404-assets/",
  plugins: [react(), tailwindcss()],
  build: {
    target: "esnext",
    outDir: "../public/404-assets",
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: fileURLToPath(new URL("./404.html", import.meta.url)),
    },
  },
});
