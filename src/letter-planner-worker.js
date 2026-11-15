import { planLetterRoutes } from "./letter-planner.js";

self.addEventListener("message", ({ data }) => {
  const route = planLetterRoutes(data.bodies, data.bounds);
  self.postMessage(route);
});
