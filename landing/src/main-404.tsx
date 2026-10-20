import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import NotFound from "./NotFound";
import "./notfound.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <NotFound />
  </StrictMode>
);

// The build prerenders the page; hydration keeps the first paint styled.
if (root.hasChildNodes()) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
