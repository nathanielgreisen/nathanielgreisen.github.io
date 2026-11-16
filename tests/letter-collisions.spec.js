import { expect, test } from "@playwright/test";
import { stepLetterPhysics } from "../src/interactions.js";
import { canSlideFormation, glyphsOverlap } from "../src/letter-navigation.js";
import { planLetterRoutes } from "../src/letter-planner.js";
import { curveLetterRoute, prepareLetterPlayback, sampleLetterRecovery } from "../src/letter-recovery.js";

test("a return route keeps velocity and acceleration continuous through a turn and a delayed start", () => {
  const route = [[0, 0, 0, 0], [40, 0, 0, 0], [64, 32, 24, 0]].map(pose => Float64Array.from(pose));
  const trip = prepareLetterPlayback(route, () => 0);
  const step = 0.0001;
  const [a, b, c, d, e] = [-2, -1, 0, 1, 2].map(i => sampleLetterRecovery(trip, 0.5 + i * step));
  for (let axis = 0; axis < c.length; axis++) {
    const incoming = (c[axis] - b[axis]) / step;
    const outgoing = (d[axis] - c[axis]) / step;
    expect(Math.abs(incoming - outgoing)).toBeLessThan(0.01);
    const before = (c[axis] - 2 * b[axis] + a[axis]) / step ** 2;
    const after = (e[axis] - 2 * d[axis] + c[axis]) / step ** 2;
    expect(Math.abs(before - after)).toBeLessThan(5);
  }
  expect(c[0]).toBeCloseTo(40);
  expect(c[2]).toBe(0);
});
import { overlapLetterMoves } from "../src/letter-schedule.js";

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

test("return paths curve in open space and stay straight in a tight lane", () => {
  const route = [new Float64Array([0, 0]), new Float64Array([160, 0])];
  const curved = curveLetterRoute(route, () => true, () => 0.75);
  expect(curved.some(point => Math.abs(point[1]) > 10)).toBe(true);
  expect(curved[0]).toEqual(route[0]);
  expect(curved.at(-1)).toEqual(route.at(-1));
  expect(curveLetterRoute(route, (a, b) => !a[1] && !b[1], () => 0.75)).toEqual(route);
});

test("rounded return paths preserve collision clearance and vary their pace", () => {
  const letters = [
    atPose(body(0, 0, 0), 55, 40, 20, 40),
    atPose(body(1, 0, 0), 20, 40, 55, 40),
    atPose(body(2, 0, 0), 38, 40, 38, 40),
  ];
  const clear = (from, to) => canSlideFormation(letters, from, to, glyphsOverlap, bounds);
  const route = planLetterRoutes(letters, bounds);
  const curved = curveLetterRoute(route, clear, () => 0.75);
  expect(curved.slice(1).every((point, index) => clear(curved[index], point))).toBe(true);

  const straight = [new Float64Array([0, 0]), new Float64Array([160, 0])];
  const trip = prepareLetterPlayback(straight, () => 0.3);
  const points = [0.2, 0.3, 0.4, 0.5, 0.6].map(t => sampleLetterRecovery(trip, t)[0]);
  const speeds = points.slice(1).map((x, i) => x - points[i]);
  expect(Math.min(...speeds)).toBeGreaterThan(0);
  expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(2);
  expect(sampleLetterRecovery(trip, 1)).toEqual(straight[1]);
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
  const original = planLetterRoutes(letters, grid);
  expect(original).not.toBeNull();
  const route = overlapLetterMoves(original, letters, grid);
  expect([...route.at(-1)]).toEqual(Array(32).fill(0));
  const stretches = route.slice(1).map((point, index) => {
    const before = route[index];
    expect(canSlideFormation(letters, before, point, glyphsOverlap, grid)).toBe(true);
    const distances = letters.map((_, j) => Math.hypot(point[j * 2] - before[j * 2],
      point[j * 2 + 1] - before[j * 2 + 1]));
    const distance = Math.max(...distances);
    return { distance, count: distances.filter(value => value > distance * 0.04).length };
  });
  const total = stretches.reduce((sum, step) => sum + step.distance, 0);
  const solo = stretches.filter(step => step.count === 1).reduce((sum, step) => sum + step.distance, 0);
  expect(solo / total).toBeLessThan(0.2);
  expect(stretches.at(-1).count).toBeGreaterThanOrEqual(4);
  const played = curveLetterRoute(route,
    (from, to) => canSlideFormation(letters, from, to, glyphsOverlap, grid), () => 0.75);
  const arrivalGroups = new Map();
  for (const [index] of letters.entries()) {
    const arrival = played.findLastIndex(pose =>
      Math.hypot(pose[index * 2], pose[index * 2 + 1]) > 1e-7) + 1;
    arrivalGroups.set(arrival, (arrivalGroups.get(arrival) ?? 0) + 1);
  }
  expect(arrivalGroups.get(played.length - 1)).toBeGreaterThanOrEqual(4);
  expect([...arrivalGroups.values()].filter(count => count > 1).length).toBeGreaterThanOrEqual(4);
});

test("three independent returns move together and finish together", () => {
  const letters = [
    atPose(body(0, 0, 0), 100, 20, 10, 20),
    atPose(body(1, 0, 0), 80, 50, 10, 50),
    atPose(body(2, 0, 0), 60, 80, 10, 80),
  ];
  const serial = [
    [90, 0, 70, 0, 50, 0],
    [0, 0, 70, 0, 50, 0],
    [0, 0, 0, 0, 50, 0],
    [0, 0, 0, 0, 0, 0],
  ].map(point => Float64Array.from(point));
  expect(overlapLetterMoves(serial, letters, bounds)).toEqual([serial[0], serial.at(-1)]);
});

test("an independent letter moves alongside a swap and shares the finish", () => {
  const letters = [
    atPose(body(0, 0, 0), 70, 40, 20, 40),
    atPose(body(1, 0, 0), 20, 40, 70, 40),
    atPose(body(2, 0, 0), 90, 90, 30, 90),
  ];
  const serial = [
    [50, 0, -50, 0, 60, 0],
    [50, -20, -50, 0, 60, 0],
    [50, -20, 0, 0, 60, 0],
    [0, -20, 0, 0, 60, 0],
    [0, 0, 0, 0, 60, 0],
    [0, 0, 0, 0, 0, 0],
  ].map(point => Float64Array.from(point));
  const scheduled = overlapLetterMoves(serial, letters, bounds);
  expect(scheduled[0]).toEqual(serial[0]);
  expect(scheduled.at(-1)).toEqual(serial.at(-1));
  for (let i = 1; i < scheduled.length; i++) {
    const from = scheduled[i - 1];
    const to = scheduled[i];
    expect(canSlideFormation(letters, from, to, glyphsOverlap, bounds)).toBe(true);
    const movers = letters.filter((_, j) => from[j * 2] !== to[j * 2] || from[j * 2 + 1] !== to[j * 2 + 1]);
    expect(movers.length).toBeGreaterThanOrEqual(2);
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

test("downward hits produce opposite spin on opposite sides of the same letter", () => {
  for (const side of [-1, 1]) {
    const top = body(0, 45 + side * 5, 0, "flick");
    top.y = 30;
    top.letter.vy = 300;
    const bottom = body(1, 45, 0);
    stepLetterPhysics([top, bottom], bounds, 0.01, () => 0.5);
    expect(Math.sign(bottom.letter.omega)).toBe(side);
    expect(top.letter.vy + bottom.letter.vy).toBeCloseTo(300);
  }
});
