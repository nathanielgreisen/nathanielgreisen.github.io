import { blocks, canSlideFormation, glyphsOverlap, obstacle } from "./letter-navigation.js";

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function fit(point, body, bounds) {
  return {
    x: Math.max(bounds.left, Math.min(bounds.right - body.bounds.width, point.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom - body.bounds.height, point.y)),
  };
}

function hasRoom(body, point, others) {
  const candidate = { mask: body.mask, x: point.x, y: point.y };
  return !others.some(other => glyphsOverlap(candidate, other));
}

function clearLine(body, from, to, others, rectangles) {
  for (let i = 0; i < others.length; i++) {
    if (blocks(body, from, to, others[i], glyphsOverlap, rectangles?.[i])) return false;
  }
  return true;
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
    if (seen.has(key)) return;
    seen.add(key);
    if (hasRoom(body, fitted, others)) nodes.push(fitted);
  }

  const rectangles = others.map(other => obstacle(body, other));
  for (const rect of rectangles) {
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

  const stepPenalty = 4;
  const heuristics = nodes.map(node => distance(node, target));
  const costs = new Float64Array(nodes.length).fill(Infinity);
  const scores = costs.slice();
  const parents = new Int32Array(nodes.length);
  const visited = new Uint8Array(nodes.length);
  costs[0] = 0;
  scores[0] = heuristics[0];
  while (true) {
    let current = -1;
    let best = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (!visited[i] && scores[i] < best) {
        best = scores[i];
        current = i;
      }
    }
    if (current < 0) return null;
    if (current === 1) {
      const route = [];
      for (let i = 1; i > 0; i = parents[i]) route.push(nodes[i]);
      return route.reverse();
    }
    visited[current] = 1;
    const currentCost = costs[current];
    const cheapestStep = currentCost + stepPenalty;
    for (let i = 1; i < nodes.length; i++) {
      if (visited[i] || costs[i] <= cheapestStep) continue;
      const cost = currentCost + distance(nodes[current], nodes[i]) + stepPenalty;
      if (cost < costs[i] && clearLine(body, nodes[current], nodes[i], others, rectangles)) {
        costs[i] = cost;
        scores[i] = cost + heuristics[i];
        parents[i] = current;
      }
    }
  }
}

function pose(bodies) {
  const offsets = new Float64Array(bodies.length * 2);
  for (let i = 0; i < bodies.length; i++) {
    const { x, y, home } = bodies[i];
    offsets[i * 2] = x - home.x;
    offsets[i * 2 + 1] = y - home.y;
  }
  return offsets;
}

function planFrom(start, bounds, order, evacuate = false) {
  const bodies = start.map(body => ({ ...body }));
  const slots = bodies.map(body => ({ ...body, ...body.home }));
  const origin = new Float64Array(bodies.length * 2);
  const route = [pose(bodies)];
  const parked = new Set();
  const visited = new Set();
  const peers = new Map();
  function othersFor(body) {
    let others = peers.get(body);
    if (!others) {
      others = bodies.filter(other => other !== body);
      peers.set(body, others);
    }
    return others;
  }
  const atHome = body => distance(body, body.home) < 0.001;
  function move(body, path) {
    for (const point of path) {
      Object.assign(body, point);
      route.push(pose(bodies));
    }
  }

  function parkOne(choices) {
    const blockers = [];
    for (const body of choices) {
      if (parked.has(body)) continue;
      let blockedHomes = 0;
      for (const slot of slots) {
        if (slot.home !== body.home && glyphsOverlap(body, slot)) blockedHomes++;
      }
      blockers.push({ body, blockedHomes, atHome: Number(atHome(body)) });
    }
    blockers.sort((a, b) => b.blockedHomes - a.blockedHomes || a.atHome - b.atHome);
    for (const { body } of blockers) {
      const others = othersFor(body);
      const free = [];
      const width = bounds.right - bounds.left - body.bounds.width;
      const height = bounds.bottom - bounds.top - body.bounds.height;
      for (const row of [0.06, 0.94, 0.25, 0.75, 0.5]) {
        const y = bounds.top + height * row;
        for (const col of [0.04, 0.96, 0.22, 0.78, 0.41, 0.59]) {
          free.push(fit({ x: bounds.left + width * col, y }, body, bounds));
        }
      }
      const unique = new Map();
      const add = point => unique.set(`${point.x},${point.y}`, point);
      for (const point of free) add(point);
      for (const { x, y } of free) {
        add({ x: body.x, y });
        add({ x, y: body.y });
      }
      const candidates = [];
      for (const point of unique.values()) {
        const length = distance(body, point);
        if (length >= 8 && hasRoom(body, point, slots) && hasRoom(body, point, others)) {
          candidates.push({ point, length });
        }
      }
      candidates.sort((a, b) => a.length - b.length);
      let path = null;
      const openSpot = candidates.find(({ point }) => clearLine(body, body, point, others));
      if (openSpot) path = [openSpot.point];
      else {
        const limit = Math.min(candidates.length, 6);
        for (let i = 0; i < limit; i++) {
          path = findPath(body, candidates[i].point, others, bounds);
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
    const state = bodies.map(body => `${body.x},${body.y},${parked.has(body)}`).join("|");
    // A parked letter can go home and recreate the same blockage. Try another strategy immediately.
    if (visited.has(state)) return null;
    visited.add(state);
    if (canSlideFormation(start, current, origin, glyphsOverlap, bounds)) {
      route.push(origin);
      return route;
    }

    const candidates = [];
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const length = distance(body, body.home);
      if (length < 0.001) continue;
      candidates.push({ index: i * 2, body, length });
    }
    candidates.sort((a, b) => order * (a.length - b.length));
    // Start neighboring direct moves together only if their complete paths are compatible.
    let target;
    for (const { index, body } of candidates) {
      if (!clearLine(body, body, body.home, othersFor(body))) continue;
      target ??= current.slice();
      target[index] = target[index + 1] = 0;
      if (canSlideFormation(start, current, target, glyphsOverlap, bounds)) {
        parked.delete(body);
      } else {
        target[index] = current[index];
        target[index + 1] = current[index + 1];
      }
    }
    if (target?.some((value, index) => value !== current[index])) {
      for (const [i, body] of bodies.entries()) {
        body.x = body.home.x + target[i * 2];
        body.y = body.home.y + target[i * 2 + 1];
      }
      route.push(target);
      continue;
    }

    let moved = false;
    for (const { body } of candidates) {
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
  const verified = route => route?.every((point, index) => index === 0 ||
    canSlideFormation(bodies, route[index - 1], point, glyphsOverlap, bounds));
  const direct = planFrom(bodies, bounds, 1);
  if (verified(direct)) return direct;

  // Some typographic gaps are too narrow to enter after both neighbors have arrived.
  // Route to a looser formation first, then close the gaps as a group.
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const { home, bounds: box } of bodies) {
    left = Math.min(left, home.x);
    right = Math.max(right, home.x + box.width);
    top = Math.min(top, home.y);
    bottom = Math.max(bottom, home.y + box.height);
  }
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const origin = new Float64Array(bodies.length * 2);
  for (const spacing of [0.35, 0.65]) {
    const offsets = new Float64Array(origin.length);
    const staging = bodies.map((body, i) => {
      const home = fit({
        x: body.home.x + (body.home.x + body.bounds.width / 2 - centerX) * spacing,
        y: body.home.y + (body.home.y + body.bounds.height / 2 - centerY) * spacing,
      }, body, bounds);
      offsets[i * 2] = home.x - body.home.x;
      offsets[i * 2 + 1] = home.y - body.home.y;
      return { ...body, home };
    });
    if (!canSlideFormation(bodies, offsets, origin, glyphsOverlap, bounds)) continue;
    const route = planFrom(staging, bounds, 1);
    if (!route) continue;
    for (const point of route) {
      for (let i = 0; i < point.length; i++) point[i] += offsets[i];
    }
    route.push(origin);
    if (verified(route)) return route;
  }

  for (const [order, evacuate] of [[1, true], [-1, false]]) {
    const route = planFrom(bodies, bounds, order, evacuate);
    if (verified(route)) return route;
  }
  return null;
}
