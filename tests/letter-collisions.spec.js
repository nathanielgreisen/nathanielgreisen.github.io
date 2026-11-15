import { expect, test } from "@playwright/test";
import { stepLetterPhysics } from "../src/interactions.js";
import { planLetterReturn, sampleLetterReturn } from "../src/letter-motion.js";
import { canSlideFormation, createLetterNavigator, findLetterRoute } from "../src/letter-navigation.js";
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

const overlaps = (a, b) => Math.abs(a.x - b.x) < size && Math.abs(a.y - b.y) < size;

for (const separation of [12, 120]) {
  test(`letters ${separation}px apart reserve space and swap without touching`, () => {
    const a = body(0, 35, 100, "return");
    const b = body(1, 35 + separation, -100, "return");
    const goals = [35 + separation, 35];
    const bodies = [a, b];
    const { steer } = createLetterNavigator(overlaps, () => false);
    const dt = 1 / 60;
    let detoured = false;
    let arrivedAt;

    for (let tick = 0; tick < 240; tick++) {
      for (const [i, entry] of bodies.entries()) {
        Object.assign(entry.letter, {
          x: entry.x - goals[i],
          y: entry.y - 40,
          vx: Math.max(-100, Math.min(100, (goals[i] - entry.x) / dt)),
          vy: Math.max(-100, Math.min(100, (40 - entry.y) / dt)),
        });
        if (Math.hypot(entry.letter.x, entry.letter.y) < 0.009) {
          entry.letter.returnGlide = null;
          entry.letter.returnSpeed = 0;
          entry.letter.returnAt = null;
          entry.letter.motionReason = "idle";
        } else {
          entry.letter.returnGlide ??= { windUp: 0, elapsed: 1 };
        }
      }
      steer(bodies, bounds, dt, tick * dt * 1000);
      stepLetterPhysics(bodies, bounds, dt);
      expect(overlaps(a, b)).toBe(false);
      detoured ||= Math.abs(a.y - 40) > size || Math.abs(b.y - 40) > size;
      if (bodies.every((entry, i) => Math.hypot(entry.x - goals[i], entry.y - 40) < 0.009)) {
        arrivedAt = tick * dt;
        break;
      }
    }
    expect(detoured).toBe(true);
    expect(arrivedAt).toBeLessThan(3);
  });
}

test("a route can use the only open side of a group of blockers", () => {
  const seeker = body(0, 15, 0, "return");
  seeker.y = 93;
  const blockers = [80, 90, 100, 110].map((y, index) => ({ ...body(index + 1, 50, 0), y }));
  const route = findLetterRoute(seeker, { x: 95, y: 93 }, blockers, bounds, overlaps);
  expect(route.at(-1)).toEqual({ x: 95, y: 93 });
  expect(route.some(point => point.y <= 70)).toBe(true);
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
  const pose = (...values) => new Float32Array(values);
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
  const pose = (...values) => new Float32Array(values);
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
