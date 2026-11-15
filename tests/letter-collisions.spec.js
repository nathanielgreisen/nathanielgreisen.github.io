import { expect, test } from "@playwright/test";
import { stepLetterPhysics } from "../src/interactions.js";
import { canSlideFormation, glyphsOverlap } from "../src/letter-navigation.js";
import { planLetterRoutes } from "../src/letter-planner.js";

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
    },
  };
}

const overlaps = (a, b) => Math.abs(a.x - b.x) < size && Math.abs(a.y - b.y) < size;

test("a coordinated route rejects even a brief collision between frames", () => {
  const dot = (left, top) => ({
    bounds: { left, top, width: 1, height: 1 },
    mask: { left: 0, top: 0, width: 1, height: 1 },
    letter: { x: 0, y: 0 },
  });
  const bodies = [dot(0, 0), dot(5.49, 6.47)];
  const touch = (a, b) => !Math.round(b.x - a.x) && !Math.round(b.y - a.y);
  const start = [0, 0, 0, 0];
  const corner = [10, 0, 0, 0];
  const end = [10, 10, 0, 0];
  expect(canSlideFormation(bodies, start, end, touch)).toBe(false);
  expect(canSlideFormation(bodies, start, corner, touch)).toBe(true);
  expect(canSlideFormation(bodies, corner, end, touch)).toBe(true);
});

function atPose(letter, x, y, homeX, homeY) {
  letter.x = x;
  letter.y = y;
  Object.assign(letter.bounds, { left: x, top: y });
  Object.assign(letter.letter, { x: x - homeX, y: y - homeY });
  return letter;
}

test("the planner creates a fresh route through a swap using just the current pose", () => {
  const letters = [
    atPose(body(0, 0, 0), 55, 40, 20, 40),
    atPose(body(1, 0, 0), 20, 40, 55, 40),
    atPose(body(2, 0, 0), 38, 40, 38, 40),
  ];
  const route = planLetterRoutes(letters, bounds);
  expect(route[0]).toEqual(new Float64Array([35, 0, -35, 0, 0, 0]));
  expect(route.length).toBeGreaterThan(2);
  expect([...route.at(-1)]).toEqual([0, 0, 0, 0, 0, 0]);
  for (let step = 1; step < route.length; step++) {
    expect(canSlideFormation(letters, route[step - 1], route[step], overlaps, bounds)).toBe(true);
  }
  expect(route.every(point => point[4] === 0 && point[5] === 0)).toBe(true);
});

test("the planner clears and refills two tightly packed rows of 16 letters", () => {
  const grid = { left: 0, top: 0, right: 370, bottom: 440 };
  const width = 19;
  const height = 35;
  const mask = {
    left: 0, top: 0, width, height,
    rows: Array.from({ length: height }, () => [[0, width]]),
  };
  const positions = Array.from({ length: 16 }, (_, i) =>
    ({ x: 28 + i % 8 * width, y: 164 + Math.floor(i / 8) * height }));
  const arrangement = [5, 9, 7, 13, 10, 3, 14, 2, 15, 8, 11, 12, 0, 1, 6, 4];
  const letters = arrangement.map((position, i) => {
    const { x, y } = positions[position];
    return {
      x, y, mask, bounds: { left: x, top: y, width, height },
      letter: { x: x - positions[i].x, y: y - positions[i].y },
    };
  });
  const route = planLetterRoutes(letters, grid);
  expect(route).not.toBeNull();
  expect([...route.at(-1)]).toEqual(Array(32).fill(0));
  expect(route.slice(1).every((point, index) =>
    canSlideFormation(letters, route[index], point, glyphsOverlap, grid))).toBe(true);
});

test("a flick carries momentum through other letters", () => {
  const flicked = body(0, 10, 500, "flick");
  const middle = body(1, 25, 0);
  const last = body(2, 40, 0);
  stepLetterPhysics([flicked, middle, last], bounds, 0.06, () => 0.8);
  expect(middle.letter.motionReason).toBe("user-impact");
  expect(last.letter.motionReason).toBe("user-impact");
  expect(last.letter.vx).toBeGreaterThan(0);
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
