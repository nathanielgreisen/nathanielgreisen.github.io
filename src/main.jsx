import { createRoot, hydrateRoot } from "react-dom/client";
import { Site } from "./Site.jsx";
import "../style.css";

const container = document.getElementById("root");
const site = <Site page={container.dataset.page} container={container} />;

if (container.hasChildNodes()) {
  hydrateRoot(container, site);
} else {
  createRoot(container).render(site);
}
