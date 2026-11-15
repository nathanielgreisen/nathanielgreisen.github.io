const clearance = 10;
const lookAhead = 0.3;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const routeLength = (start, points) => points.reduce((sum, end, index) =>
  sum + distance(index ? points[index - 1] : start, end), 0);

function home(body) {
  return { x: body.x - body.letter.x, y: body.y - body.letter.y };
}

function fit(point, body, bounds) {
  return {
    x: Math.max(bounds.left, Math.min(bounds.right - body.bounds.width, point.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom - body.bounds.height, point.y)),
  };
}

function obstacle(body, other) {
  return {
    left: other.x + other.mask.left - body.mask.left - body.mask.width,
    right: other.x + other.mask.left + other.mask.width - body.mask.left,
    top: other.y + other.mask.top - body.mask.top - body.mask.height,
    bottom: other.y + other.mask.top + other.mask.height - body.mask.top,
  };
}

// Find the part of a line that passes through a possible collision with a glyph.
function crossing(start, end, rect) {
  let enter = 0;
  let exit = 1;
  for (const [axis, min, max] of [["x", rect.left, rect.right], ["y", rect.top, rect.bottom]]) {
    const delta = end[axis] - start[axis];
    if (!delta) {
      if (start[axis] < min || start[axis] > max) return null;
      continue;
    }
    const a = (min - start[axis]) / delta;
    const b = (max - start[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return null;
  }
  return [enter, exit];
}

function blocks(body, start, end, other, overlaps) {
  const interval = crossing(start, end, obstacle(body, other));
  if (!interval) return false;
  const [first, last] = interval;
  const steps = Math.max(1, Math.ceil(distance(start, end) * (last - first) / 2));
  for (let i = 0; i <= steps; i++) {
    const t = first + (last - first) * i / steps;
    const at = { ...body, x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
    if (overlaps(at, other)) return true;
  }
  return false;
}

export function findLetterRoute(body, destination, others, bounds, overlaps) {
  const target = fit(destination, body, bounds);
  if (distance(target, destination) > 0.1) return null;
  const free = point => !others.some(other => overlaps({ ...body, ...point }, other));
  const clear = (a, b) => !others.some(other => blocks(body, a, b, other, overlaps));
  if (!free(target)) return null;
  if (clear(body, target)) return [target];

  const nodes = [body, target];
  for (const other of others) {
    const { left, right, top, bottom } = obstacle(body, other);
    for (const x of [left - clearance, right + clearance]) {
      for (const y of [top - clearance, bottom + clearance]) {
        const point = fit({ x, y }, body, bounds);
        if (free(point)) nodes.push(point);
      }
    }
  }

  // A visibility graph lets routes run diagonally instead of following a tile grid.
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
        current = i;
        best = score;
      }
    }
    if (current === -1) return null;
    if (current === 1) {
      const route = [];
      for (let i = 1; i > 0; i = parents[i]) route.unshift(nodes[i]);
      return route;
    }
    visited.add(current);
    for (let i = 1; i < nodes.length; i++) {
      if (visited.has(i)) continue;
      const cost = costs[current] + distance(nodes[current], nodes[i]);
      if (cost < costs[i] && clear(nodes[current], nodes[i])) {
        costs[i] = cost;
        parents[i] = current;
      }
    }
  }
}

function sharedTrip(a, b, bodies, bounds, overlaps) {
  const route = (body, goal, obstacles = bodies) =>
    findLetterRoute(body, goal, obstacles.filter(other => other.letter !== body.letter), bounds, overlaps);
  const position = (entries, letter, point) =>
    entries.map(entry => entry.letter === letter ? { ...entry, ...point } : entry);
  let best = null;
  let bestLength = Infinity;

  for (const [first, second] of [[a, b], [b, a]]) {
    const rect = obstacle(first, second);
    const candidates = [
      home(first),
      { x: first.x, y: rect.top - clearance }, { x: first.x, y: rect.bottom + clearance },
      { x: rect.left - clearance, y: first.y }, { x: rect.right + clearance, y: first.y },
    ].map(point => fit(point, first, bounds));
    for (const parking of candidates) {
      const path = route(first, parking);
      if (!path) continue;
      const parkedBodies = position(bodies, first.letter, parking);
      const through = route(second, home(second), parkedBodies);
      if (!through) continue;
      const phases = [{ letter: first.letter, route: path }, { letter: second.letter, route: through }];
      let total = routeLength(first, path) + routeLength(second, through);
      if (distance(parking, home(first)) > 0.01) {
        const parked = { ...first, ...parking };
        const onward = route(parked, home(first), position(parkedBodies, second.letter, home(second)));
        if (!onward) continue;
        total += routeLength(parked, onward);
        phases.push({ letter: first.letter, route: onward });
      }
      if (total < bestLength) {
        bestLength = total;
        best = phases;
      }
    }
  }
  return best;
}

export function createLetterNavigator(overlaps, isUserMotion) {
  let reservation = null;
  let nextSearch = 0;

  function follow(body, route, dt) {
    while (route.length > 1 && distance(body, route[0]) < 4) route.shift();
    const target = route[0];
    const remaining = distance(body, target);
    const { letter } = body;
    const maxSpeed = Math.max(160, letter.returnSpeed * 1.45);
    const speed = Math.min(maxSpeed, Math.sqrt(2 * 900 * remaining), remaining / dt);
    const desiredX = remaining ? (target.x - body.x) / remaining * speed : 0;
    const desiredY = remaining ? (target.y - body.y) / remaining * speed : 0;
    const previousX = letter.navigationVX ?? 0;
    const previousY = letter.navigationVY ?? 0;
    const change = Math.hypot(desiredX - previousX, desiredY - previousY);
    const blend = remaining < 2 ? 1 : Math.min(1, 1200 * dt / Math.max(change, 1));
    letter.vx = letter.navigationVX = previousX + (desiredX - previousX) * blend;
    letter.vy = letter.navigationVY = previousY + (desiredY - previousY) * blend;
  }

  return function steer(bodies, bounds, dt, time) {
    const returning = bodies.filter(body => body.letter.returnGlide);
    if (reservation) {
      const { participants, phases } = reservation;
      if (participants.some(letter => !letter.returnGlide && letter.motionReason !== "idle")) {
        reservation = null;
      } else {
        const phase = phases[0];
        const active = returning.find(body => body.letter === phase.letter);
        if ((!active && phase.letter.returnAt === null) ||
            (active && phase.route.length === 1 && distance(active, phase.route[0]) < 0.01)) {
          phases.shift();
        }
        if (!phases.length) reservation = null;
      }
    }

    if (!reservation && time >= nextSearch) {
      nextSearch = time + 100;
      for (const body of returning) {
        const { letter } = body;
        if (letter.returnGlide.elapsed < letter.returnGlide.windUp) continue;
        const ahead = fit({ x: body.x + letter.vx * lookAhead, y: body.y + letter.vy * lookAhead }, body, bounds);
        if (distance(body, ahead) < 0.01) continue;
        for (const other of bodies) {
          if (other === body || isUserMotion(other.letter)) continue;
          const otherReturning = Boolean(other.letter.returnGlide ||
            (other.letter.returnAt !== null && other.letter.returnAt <= time + 650));
          const relative = otherReturning ? {
            x: ahead.x - other.letter.vx * lookAhead,
            y: ahead.y - other.letter.vy * lookAhead,
          } : ahead;
          if (!blocks(body, body, relative, other, overlaps)) continue;

          const obstacles = bodies.filter(entry => !isUserMotion(entry.letter));
          const phases = otherReturning
            ? sharedTrip(body, other, obstacles, bounds, overlaps)
            : (() => {
              const route = findLetterRoute(body, home(body), obstacles.filter(entry => entry !== body), bounds, overlaps);
              return route ? [{ letter, route }] : null;
            })();
          if (!phases) continue;
          const participants = otherReturning ? [letter, other.letter] : [letter];
          for (const participant of participants) {
            if (participant.returnGlide) participant.returnGlide.detoured = true;
            participant.navigationVX = participant.navigationVY = 0;
          }
          reservation = { phases, participants };
          break;
        }
        if (reservation) break;
      }
    }

    if (!reservation) return;
    const [phase] = reservation.phases;
    const leader = returning.find(body => body.letter === phase.letter);
    if (leader && time >= nextSearch) {
      nextSearch = time + 100;
      const others = bodies.filter(other => other !== leader && !isUserMotion(other.letter));
      if (others.some(other => blocks(leader, leader, phase.route[0], other, overlaps))) {
        const replacement = findLetterRoute(leader, phase.route.at(-1), others, bounds, overlaps);
        if (replacement) phase.route = replacement;
        else {
          reservation = null;
          return;
        }
      }
    }
    for (const body of returning) {
      if (!reservation.participants.includes(body.letter)) continue;
      body.letter.returnGlide.detoured = true;
      if (body.letter === phase.letter) {
        follow(body, phase.route, dt);
      } else {
        body.letter.vx = body.letter.vy = 0;
      }
    }
  };
}
