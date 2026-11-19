import { mountPageInteractions } from "./grid-interactions.js";
import "../style.css";

const container = document.getElementById("root");
const { pathname, search, hash } = window.location;
if (pathname.endsWith("/index.html")) {
  history.replaceState(history.state, "", pathname.slice(0, -"index.html".length) + search + hash);
}

export function startPage(mountInteractions) {
  if (import.meta.env.DEV) {
    import("./dev.jsx").then(({ renderPage }) => renderPage(container, mountInteractions));
  } else {
    mountInteractions(container);
  }
}

if (container.dataset.page !== "index") {
  startPage(root => mountPageInteractions(root).dispose);
}
