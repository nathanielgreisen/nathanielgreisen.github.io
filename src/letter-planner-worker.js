import { canSlideFormation, glyphsOverlap } from "./letter-navigation.js";
import { planLetterRoutes } from "./letter-planner.js";
import { curveLetterRoute } from "./letter-recovery.js";
import { overlapLetterMoves } from "./letter-schedule.js";

self.addEventListener("message", ({ data }) => {
  const { bodies, bounds } = data;
  const route = planLetterRoutes(bodies, bounds);
  const clear = (from, to) => canSlideFormation(bodies, from, to, glyphsOverlap, bounds);
  const scheduled = route && overlapLetterMoves(route, bodies, bounds);
  const safe = scheduled?.every((point, index) => !index || clear(scheduled[index - 1], point));
  self.postMessage(route && curveLetterRoute(safe ? scheduled : route, clear));
});
