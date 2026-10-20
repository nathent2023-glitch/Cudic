import { renderToString } from "react-dom/server";

import NotFound from "./NotFound";

export function render(): string {
  return renderToString(<NotFound />);
}
