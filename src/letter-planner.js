import { blocks, canSlideFormation, glyphsOverlap, obstacle } from "./letter-navigation.js";

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function fit(point, body, bounds) {
  return {
    x: Math.max(bounds.left, Math.min(bounds.right - body.bounds.width, point.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom - body.bounds.height, point.y)),
  };
}

function hasRoom(body, point, others) {
  const candidate = { ...body, ...point };
  return !others.some(other => glyphsOverlap(candidate, other));
}

function clearLine(body, from, to, others) {
  return !others.some(other => blocks(body, from, to, other, glyphsOverlap));
}

function findPath(body, target, others, bounds) {
  if (distance(target, fit(target, body, bounds)) > 0.001 || !hasRoom(body, target, others)) return null;
  const clear = (from, to) => clearLine(body, from, to, others);
  if (clear(body, target)) return [target];

  // Try simple bends before building a graph around the glyphs blocking the corridor.
  for (const corner of [{ x: body.x, y: target.y }, { x: target.x, y: body.y }]) {
    if (clear(body, corner) && clear(corner, target)) return [corner, target];
  }
  const nodes = [body, target];
  const seen = new Set(nodes.map(({ x, y }) => `${x},${y}`));
  function add(point) {
    const fitted = fit(point, body, bounds);
    const key = `${fitted.x},${fitted.y}`;
    if (seen.has(key) || !hasRoom(body, fitted, others)) return;
    seen.add(key);
    nodes.push(fitted);
  }

  for (const other of others) {
    const rect = obstacle(body, other);
    for (const padding of [3, 0.65]) {
      for (const x of [rect.left - padding, rect.right + padding]) {
        for (const y of [rect.top - padding, rect.bottom + padding]) add({ x, y });
        add({ x, y: body.y });
        add({ x, y: target.y });
      }
      for (const y of [rect.top - padding, rect.bottom + padding]) {
        add({ x: body.x, y });
        add({ x: target.x, y });
      }
    }
  }
  // Short steps let a letter leave a tight gap without cutting a corner.
  for (const step of [1, 4, 12]) {
    for (const dx of [-step, 0, step]) for (const dy of [-step, 0, step]) {
      if (dx || dy) add({ x: body.x + dx, y: body.y + dy });
    }
  }

  const costs = nodes.map(() => Infinity);
  const parents = nodes.map(() => -1);
  const visited = new Set();
  costs[0] = 0;
  while (true) {
    let current = -1;
    let best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const score = costs[i] + distance(nodes[i], target);
      if (!visited.has(i) && score < best) {
        best = score;
        current = i;
      }
    }
    if (current < 0) return null;
    if (current === 1) {
      const route = [];
      for (let i = 1; i > 0; i = parents[i]) route.unshift(nodes[i]);
      return route;
    }
    visited.add(current);
    for (let i = 1; i < nodes.length; i++) {
      if (visited.has(i)) continue;
      const cost = costs[current] + distance(nodes[current], nodes[i]) + 4;
      if (cost < costs[i] && clear(nodes[current], nodes[i])) {
        costs[i] = cost;
        parents[i] = current;
      }
    }
  }
}

function pose(bodies) {
  return Float64Array.from(bodies.flatMap(body => [body.x - body.home.x, body.y - body.home.y]));
}

function planFrom(start, bounds, order, evacuate = false) {
  const bodies = start.map(body => ({ ...body }));
  const slots = bodies.map(body => ({ ...body, ...body.home }));
  const origin = new Float64Array(bodies.length * 2);
  const route = [pose(bodies)];
  const parked = new Set();
  const othersFor = body => bodies.filter(other => other !== body);
  const atHome = body => distance(body, body.home) < 0.001;
  function move(body, path) {
    for (const point of path) {
      Object.assign(body, point);
      route.push(pose(bodies));
    }
  }

  function parkOne(choices) {
    const blockers = choices.filter(body => !parked.has(body));
    const blockedHomes = new Map(blockers.map(body => [
      body, slots.filter(slot => slot.home !== body.home && glyphsOverlap(body, slot)).length,
    ]));
    blockers.sort((a, b) => blockedHomes.get(b) - blockedHomes.get(a) || Number(atHome(a)) - Number(atHome(b)));
    for (const body of blockers) {
      const others = othersFor(body);
      const free = [];
      for (const row of [0.06, 0.94, 0.25, 0.75, 0.5]) {
        for (const col of [0.04, 0.96, 0.22, 0.78, 0.41, 0.59]) {
          const point = fit({
            x: bounds.left + (bounds.right - bounds.left - body.bounds.width) * col,
            y: bounds.top + (bounds.bottom - bounds.top - body.bounds.height) * row,
          }, body, bounds);
          free.push(point);
        }
      }
      const aligned = free.flatMap(point => [
        { x: body.x, y: point.y },
        { x: point.x, y: body.y },
      ]);
      const unique = new Map([...free, ...aligned].map(point => [`${point.x},${point.y}`, point]));
      const candidates = [...unique.values()].filter(point =>
        distance(body, point) >= 8 && hasRoom(body, point, slots) && hasRoom(body, point, others));
      candidates.sort((a, b) => distance(body, a) - distance(body, b));
      let path = null;
      const openSpot = candidates.find(point => clearLine(body, body, point, others));
      if (openSpot) path = [openSpot];
      else {
        for (const point of candidates.slice(0, 6)) {
          path = findPath(body, point, others, bounds);
          if (path) break;
        }
      }
      if (!path) continue;
      move(body, path);
      parked.add(body);
      return true;
    }
    return false;
  }

  if (evacuate) {
    // Clear the original cluster first when incremental moves keep recreating the blockage.
    for (let attempt = 0; attempt < bodies.length; attempt++) {
      const waiting = bodies.filter(body => !atHome(body) && !parked.has(body));
      if (!waiting.length) break;
      if (!parkOne(waiting) && !parkOne(bodies)) return null;
    }
  }

  for (let attempt = 0; attempt < bodies.length * 4; attempt++) {
    const current = route.at(-1);
    if (current.every(offset => offset === 0)) return route;
    if (canSlideFormation(start, current, origin, glyphsOverlap, bounds)) return [...route, origin];

    const remaining = bodies.filter(body => !atHome(body));
    const candidates = [...remaining].sort((a, b) =>
      order * (distance(a, a.home) - distance(b, b.home)));
    const direct = candidates.filter(body => clearLine(body, body, body.home, othersFor(body)));
    if (direct.length) {
      // Start neighboring direct moves together only if their complete paths are compatible.
      const target = current.slice();
      for (const body of direct) {
        const index = bodies.indexOf(body) * 2;
        target[index] = target[index + 1] = 0;
        if (canSlideFormation(start, current, target, glyphsOverlap, bounds)) {
          parked.delete(body);
        } else {
          target[index] = current[index];
          target[index + 1] = current[index + 1];
        }
      }
      if (target.some((value, index) => value !== current[index])) {
        for (const [i, body] of bodies.entries()) {
          body.x = body.home.x + target[i * 2];
          body.y = body.home.y + target[i * 2 + 1];
        }
        route.push(target);
        continue;
      }
    }

    let moved = false;
    for (const body of candidates) {
      const path = findPath(body, body.home, othersFor(body), bounds);
      if (!path) continue;
      move(body, path);
      parked.delete(body);
      moved = true;
      break;
    }
    if (moved) continue;

    if (!parkOne(bodies)) return null;
  }
  return null;
}

export function planLetterRoutes(input, bounds) {
  const bodies = input.map(body => ({
    ...body,
    home: { x: body.bounds.left - body.letter.x, y: body.bounds.top - body.letter.y },
  }));
  for (const [order, evacuate] of [[1, false], [1, true], [-1, false]]) {
    const route = planFrom(bodies, bounds, order, evacuate);
    if (route?.every((point, index) => index === 0 ||
      canSlideFormation(bodies, route[index - 1], point, glyphsOverlap, bounds))) return route;
  }
  return null;
}
