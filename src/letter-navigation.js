export function glyphsOverlap(a, b) {
  const first = a.mask;
  const second = b.mask;
  const x = b.x + second.left - a.x - first.left;
  if (x >= first.width - 0.5 || x < 0.5 - second.width) return false;
  const yOffset = b.y + second.top - a.y - first.top;
  if (yOffset >= first.height - 0.5 || yOffset < 0.5 - second.height) return false;
  const dx = Math.round(x);
  const dy = Math.round(yOffset);
  const bottom = Math.min(first.height, dy + second.height);
  for (let y = Math.max(0, dy); y < bottom; y++) {
    const row = first.rows[y];
    const otherRow = second.rows[y - dy];
    let i = 0, j = 0;
    while (i < row.length && j < otherRow.length) {
      if (row[i][1] <= otherRow[j][0] + dx) i++;
      else if (otherRow[j][1] + dx <= row[i][0]) j++;
      else return true;
    }
  }
  return false;
}

export function obstacle(body, other) {
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

export function blocks(body, start, end, other, overlaps) {
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

export function canCurveFormation(bodies, controls) {
  // A Bézier curve stays inside its control hull. Check every rounded mask
  // offset in that hull, subdividing when the rectangle is too conservative.
  function clearPair(a, b, xs, ys, depth = 0) {
    const left = Math.max(1 - b.mask.width, Math.round(Math.min(...xs)));
    const right = Math.min(a.mask.width - 1, Math.round(Math.max(...xs)));
    const top = Math.max(1 - b.mask.height, Math.round(Math.min(...ys)));
    const bottom = Math.min(a.mask.height - 1, Math.round(Math.max(...ys)));
    if (left > right || top > bottom) return true;
    if ((right - left + 1) * (bottom - top + 1) <= 48 || depth === 8) {
      let blocked = false;
      for (let y = top; y <= bottom && !blocked; y++) {
        for (let x = left; x <= right && !blocked; x++) {
          blocked = glyphsOverlap(a, { ...b, x, y });
        }
      }
      if (!blocked) return true;
      if (depth === 8 || (left === right && top === bottom)) return false;
    }
    function split(values) {
      const first = [values[0]];
      const last = [values.at(-1)];
      while (values.length > 1) {
        values = values.slice(1).map((value, i) => (value + values[i]) / 2);
        first.push(values[0]);
        last.push(values.at(-1));
      }
      return [first, last.reverse()];
    }
    const [x1, x2] = split(xs);
    const [y1, y2] = split(ys);
    return clearPair(a, b, x1, y1, depth + 1) && clearPair(a, b, x2, y2, depth + 1);
  }
  const masks = bodies.map(({ mask }) => ({
    x: -mask.left, y: -mask.top, mask,
  }));
  for (const [i, a] of bodies.entries()) {
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const x = b.bounds.left - b.letter.x + b.mask.left - (a.bounds.left - a.letter.x + a.mask.left);
      const y = b.bounds.top - b.letter.y + b.mask.top - (a.bounds.top - a.letter.y + a.mask.top);
      const xs = controls.map(pose => x + pose[j * 2] - pose[i * 2]);
      const ys = controls.map(pose => y + pose[j * 2 + 1] - pose[i * 2 + 1]);
      const target = { mask: { ...b.mask, left: 0, top: 0 } };
      if (!clearPair(masks[i], target, xs, ys)) return false;
    }
  }
  return true;
}

export function glyphContact(a, b) {
  const dx = Math.round(b.x + b.mask.left - a.x - a.mask.left);
  const dy = Math.round(b.y + b.mask.top - a.y - a.mask.top);
  if (dx >= a.mask.width || dx + b.mask.width <= 0) return null;
  const bottom = Math.min(a.mask.height, dy + b.mask.height);
  let ink = 0;
  let x = 0;
  let y = 0;
  for (let row = Math.max(0, dy); row < bottom; row++) {
    for (const [left, right] of a.mask.rows[row]) {
      for (const [otherLeft, otherRight] of b.mask.rows[row - dy]) {
        const start = Math.max(left, otherLeft + dx);
        const end = Math.min(right, otherRight + dx);
        if (end <= start) continue;
        const count = end - start;
        ink += count;
        x += count * (start + end) / 2;
        y += count * (row + 0.5);
      }
    }
  }
  return ink ? { x: a.x + a.mask.left + x / ink, y: a.y + a.mask.top + y / ink } : null;
}
