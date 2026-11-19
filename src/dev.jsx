import { createRoot } from "react-dom/client";
import { Site } from "./Site.jsx";

export function renderPage(container, mountInteractions) {
  const root = createRoot(container);
  root.render(<Site page={container.dataset.page} mount={() => mountInteractions(container)} />);
}
