import { expect, test } from "@playwright/test";
import { stepLetterPhysics } from "../src/interactions.js";
import { planLetterReturn, sampleLetterReturn } from "../src/letter-motion.js";

const bounds = { left: 0, top: 0, right: 300, bottom: 120 };
const size = 10;
const mask = {
  left: 0, top: 0, width: size, height: size,
  rows: Array.from({ length: size }, () => [[0, size]]),
};

function body(index, x, vx, motionReason = "idle") {
  return {
    x,
    y: 40,
    bounds: { width: size, height: size },
    mask,
    letter: {
      index, vx, vy: 0, motionReason,
      element: { textContent: "x", dataset: {} },
      returnSpeed: motionReason === "return" ? Math.abs(vx) : 0,
      returnAt: 3000,
    },
  };
}

test("automatic returns push a stationary letter through without resetting", () => {
  const returning = body(0, 10, 100, "return");
  const idle = body(1, 20, 0);
  stepLetterPhysics([returning, idle], bounds, 0.1);
  expect(returning.x).toBeGreaterThan(17);
  expect(idle.x).toBeGreaterThan(27);
  expect(returning.letter.returnSpeed).toBe(100);
  expect(idle.letter.motionReason).toBe("return-push");
});

test("two returning letters keep their return state when they cross", () => {
  const left = body(0, 25, 100, "return");
  const right = body(1, 35, -100, "return");
  stepLetterPhysics([left, right], bounds, 0.3);
  expect(left.x).toBeGreaterThan(right.x);
  expect(left.letter.returnSpeed).toBe(100);
  expect(right.letter.returnSpeed).toBe(100);
});

test("a flick carries user impact through other letters and interrupts a return", () => {
  const flicked = body(0, 10, 500, "flick");
  const middle = body(1, 25, 0);
  const returning = body(2, 40, -100, "return");
  stepLetterPhysics([flicked, middle, returning], bounds, 0.06, () => 0.8);
  expect(middle.letter.motionReason).toBe("user-impact");
  expect(returning.letter.motionReason).toBe("user-impact");
  expect(returning.letter.returnSpeed).toBe(0);
  expect(returning.letter.returnAt).toBeNull();
  expect(returning.letter.vx).toBeGreaterThan(0);
});

test("an aligned hit can knock a letter to either side while preserving momentum", () => {
  for (const random of [0.25, 0.75]) {
    const flicked = body(0, 10, 300, "flick");
    const idle = body(1, 20, 0);
    stepLetterPhysics([flicked, idle], bounds, 0.02, () => random);
    expect(idle.letter.vx).toBeGreaterThan(200);
    expect(Math.sign(idle.letter.vy)).toBe(random < 0.5 ? -1 : 1);
    expect(flicked.letter.vy + idle.letter.vy).toBeCloseTo(0);
    expect(flicked.letter.vx + idle.letter.vx).toBeCloseTo(300);
  }
});

test("a return winds up, accelerates on a curved path, and brakes at home", () => {
  const plan = planLetterReturn(650, 0, () => 0.75);
  expect(plan.duration).toBe(5);
  expect(sampleLetterReturn(plan, plan.windUp).x).toBeGreaterThan(650);
  const distanceOver = (start, end) => sampleLetterReturn(plan, start).x - sampleLetterReturn(plan, end).x;
  expect(distanceOver(0.6, 0.7)).toBeGreaterThan(distanceOver(0.25, 0.35));
  expect(sampleLetterReturn(plan, 2.5).y).toBeGreaterThan(10);
  expect(distanceOver(4.9, 5)).toBeLessThan(distanceOver(4.5, 4.6));
  expect(sampleLetterReturn(plan, 5)).toEqual({ x: 0, y: 0 });
  expect(planLetterReturn(40, 0).duration).toBe(0.4);
});
