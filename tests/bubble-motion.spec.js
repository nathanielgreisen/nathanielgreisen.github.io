import { expect, test } from "@playwright/test";
import { beginBubbleMerge, sampleBubbleMotion } from "../src/bubble-motion.js";

test("unequal bubbles merge continuously and conserve their combined area", () => {
  const large = { x: 100, y: 160, radius: 50, drift: 5, riseSpeed: 79, age: 1 };
  const small = { x: 155, y: 160, radius: 8, drift: -17, riseSpeed: 65, age: 0.7 };
  const merged = beginBubbleMerge(small, large, 1000);
  const start = sampleBubbleMotion(merged, 1000);
  expect(start).toMatchObject({ x: large.x, y: large.y, radius: large.radius });
  expect(start.tail).toMatchObject({ x: small.x, y: small.y, radius: small.radius, opacity: 1 });
  expect(merged.x - large.x).toBeLessThan(2);

  const middle = sampleBubbleMotion(merged, 1160);
  expect(middle.radius).toBeGreaterThan(large.radius);
  expect(middle.tail.x - middle.x).toBeLessThan(small.x - large.x);
  expect(middle.radius ** 2 + middle.tail.radius ** 2).toBeCloseTo(large.radius ** 2 + small.radius ** 2);

  const last = sampleBubbleMotion(merged, 1319);
  const end = sampleBubbleMotion(merged, 1320);
  expect(Math.hypot(end.x - last.x, end.y - last.y)).toBeLessThan(0.2);
  expect(end.radius - last.radius).toBeLessThan(0.01);
  expect(end.tail).toBeUndefined();
});
