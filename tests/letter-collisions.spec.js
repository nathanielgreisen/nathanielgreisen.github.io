import { expect, test } from "@playwright/test";
import { stepLetterPhysics } from "../src/interactions.js";
import { canSlideFormation } from "../src/letter-navigation.js";
import { createLetterHistory, sampleLetterRecovery } from "../src/letter-recovery.js";

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

test("regrouping retraces a safe route when the straight path would cross", () => {
  const a = body(0, 40, 0);
  const b = body(1, 10, 0);
  a.bounds.left = a.x;
  a.bounds.top = a.y;
  b.bounds.left = b.x;
  b.bounds.top = b.y;
  a.letter.x = 30;
  b.letter.x = -30;
  a.letter.y = b.letter.y = 0;
  const history = createLetterHistory(2);
  const pose = (...values) => new Float64Array(values);
  const swapped = pose(30, 0, -30, 0);
  const clear = (from, to) => canSlideFormation([a, b], from, to, overlaps);

  history.record(pose(0, -20, 0, 0));
  history.record(pose(30, -20, -30, 0));
  history.record(swapped);
  expect(clear(swapped, pose(0, 0, 0, 0))).toBe(false);
  const trip = history.buildRoute(swapped, clear);
  expect(trip.route.length).toBeGreaterThan(2);
  for (let frame = 0; frame <= 240; frame++) {
    const [ax, ay, bx, by] = sampleLetterRecovery(trip, frame / 240);
    expect(overlaps({ x: 10 + ax, y: 40 + ay }, { x: 40 + bx, y: 40 + by })).toBe(false);
  }
  expect(sampleLetterRecovery(trip, 1)).toEqual(pose(0, 0, 0, 0));
});

test("a shorter regroup route leaves an already settled letter in place", () => {
  const history = createLetterHistory(3);
  const pose = (...values) => new Float64Array(values);
  const positions = ([ax, ay, bx, by]) => [{ x: 10 + ax, y: 40 + ay }, { x: 40 + bx, y: 40 + by }];
  const clear = (from, to) => {
    for (let step = 0; step <= 64; step++) {
      const point = from.map((value, i) => value + (to[i] - value) * step / 64);
      if (overlaps(...positions(point))) return false;
    }
    return true;
  };
  history.record(pose(0, -20, 0, 0, 80, 40));
  history.record(pose(30, -20, -30, 0, 20, 30));
  const trip = history.buildRoute(pose(30, 0, -30, 0, 0, 0), clear);
  for (let frame = 0; frame <= 120; frame++) {
    const sample = sampleLetterRecovery(trip, frame / 120);
    expect(overlaps(...positions(sample))).toBe(false);
    expect([...sample.slice(4)]).toEqual([0, 0]);
  }
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
