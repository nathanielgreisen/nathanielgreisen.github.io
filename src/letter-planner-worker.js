import { canCurveFormation, canSlideFormation, glyphsOverlap } from "./letter-navigation.js";
import { planLetterRoutes } from "./letter-planner.js";
import { curveLetterRoute, prepareLetterPlayback } from "./letter-recovery.js";
import { overlapLetterMoves } from "./letter-schedule.js";

self.addEventListener("message", ({ data }) => {
  const { bodies, bounds } = data;
  const route = planLetterRoutes(bodies, bounds);
  if (!route) {
    self.postMessage(null);
    return;
  }

  const clear = (from, to) => canSlideFormation(bodies, from, to, glyphsOverlap, bounds);
  const scheduled = overlapLetterMoves(route, bodies, bounds);
  const safe = scheduled === route || scheduled.every((point, index) => !index || clear(scheduled[index - 1], point));
  const curved = curveLetterRoute(safe ? scheduled : route, clear);
  self.postMessage(prepareLetterPlayback(curved, Math.random, controls => canCurveFormation(bodies, controls)));
});
