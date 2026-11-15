import { expect, test } from "@playwright/test";
import { stepLetterPhysics } from "../src/interactions.js";

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
  stepLetterPhysics([flicked, middle, returning], bounds, 0.06);
  expect(middle.letter.motionReason).toBe("user-impact");
  expect(returning.letter.motionReason).toBe("user-impact");
  expect(returning.letter.returnSpeed).toBe(0);
  expect(returning.letter.returnAt).toBeNull();
  expect(returning.letter.vx).toBeGreaterThan(0);
});
