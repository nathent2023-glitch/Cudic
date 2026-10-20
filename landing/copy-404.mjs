import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Render the React tree once at build time so the page paints styled before
// the JS bundle loads, then hydrate it on the client.
const { render } = await import("./dist-404-server/entry-404-server.js");

const src = fileURLToPath(new URL("../public/404-assets/404.html", import.meta.url));
const out = fileURLToPath(new URL("../public/404.html", import.meta.url));
const page = readFileSync(src, "utf8");
const markup = render();

if (!page.includes('<div id="root"></div>')) {
  throw new Error("404.html is missing the empty #root placeholder");
}

writeFileSync(
  out,
  page.replace('<div id="root"></div>', `<div id="root">${markup}</div>`)
);
console.log(`wrote public/404.html (${markup.length} bytes of prerendered html)`);
