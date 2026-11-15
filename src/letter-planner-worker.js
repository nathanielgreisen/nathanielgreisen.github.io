import { canSlideFormation, glyphsOverlap } from "./letter-navigation.js";
import { planLetterRoutes } from "./letter-planner.js";
import { curveLetterRoute } from "./letter-recovery.js";

self.addEventListener("message", ({ data }) => {
  const { bodies, bounds } = data;
  const route = planLetterRoutes(bodies, bounds);
  self.postMessage(route && curveLetterRoute(route, (from, to) =>
    canSlideFormation(bodies, from, to, glyphsOverlap, bounds)));
});
