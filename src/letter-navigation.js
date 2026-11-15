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
  const rect = obstacle(body, other);
  const interval = crossing(start, end, {
    left: rect.left - 0.5, right: rect.right + 0.5,
    top: rect.top - 0.5, bottom: rect.bottom + 0.5,
  });
  if (!interval) return false;
  const [first, last] = interval;
  const times = [first, last];
  // Glyph overlap stays constant between half-pixel changes in relative position.
  for (const axis of ["x", "y"]) {
    const offset = axis === "x" ? "left" : "top";
    const delta = end[axis] - start[axis];
    if (!delta) continue;
    const relative = start[axis] + body.mask[offset] - other[axis] - other.mask[offset];
    const startOffset = relative + delta * first;
    const endOffset = relative + delta * last;
    const low = Math.min(startOffset, endOffset);
    const high = Math.max(startOffset, endOffset);
    for (let edge = Math.ceil(low - 0.5) + 0.5; edge < high; edge++) {
      const time = (edge - relative) / delta;
      if (time > first && time < last) times.push(time);
    }
  }
  times.sort((a, b) => a - b);
  const overlapsAt = t => overlaps({
    ...body, x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t,
  }, other);
  return times.some((t, i) => overlapsAt(t) ||
    (i > 0 && overlapsAt((times[i - 1] + t) / 2)));
}

export function canSlideFormation(bodies, from, to, overlaps, bounds) {
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    const start = {
      x: a.bounds.left - a.letter.x + from[i * 2],
      y: a.bounds.top - a.letter.y + from[i * 2 + 1],
    };
    if (bounds) {
      const endX = a.bounds.left - a.letter.x + to[i * 2];
      const endY = a.bounds.top - a.letter.y + to[i * 2 + 1];
      const padding = 0.02;
      if (Math.min(start.x, endX) < bounds.left - padding ||
          Math.max(start.x, endX) + a.bounds.width > bounds.right + padding ||
          Math.min(start.y, endY) < bounds.top - padding ||
          Math.max(start.y, endY) + a.bounds.height > bounds.bottom + padding) return false;
    }
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const other = {
        ...b,
        x: b.bounds.left - b.letter.x + from[j * 2],
        y: b.bounds.top - b.letter.y + from[j * 2 + 1],
      };
      const dx = to[i * 2] - from[i * 2] - to[j * 2] + from[j * 2];
      const dy = to[i * 2 + 1] - from[i * 2 + 1] - to[j * 2 + 1] + from[j * 2 + 1];
      if (!dx && !dy) {
        if (overlaps({ ...a, ...start }, other)) return false;
        continue;
      }
      if (blocks(a, start, { x: start.x + dx, y: start.y + dy }, other, overlaps)) return false;
    }
  }
  return true;
}
