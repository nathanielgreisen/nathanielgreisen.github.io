export function glyphsOverlap(a, b) {
  return overlapAt(a.mask, b.mask, a.x, a.y, b.x, b.y);
}

function overlapAt(first, second, ax, ay, bx, by) {
  const x = bx + second.left - ax - first.left;
  if (x >= first.width - 0.5 || x < 0.5 - second.width) return false;
  const y = by + second.top - ay - first.top;
  if (y >= first.height - 0.5 || y < 0.5 - second.height) return false;
  return masksOverlap(first, second, Math.round(x), Math.round(y));
}

function masksOverlap(first, second, dx, dy) {
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

function addCrossings(times, relative, delta, first, last) {
  const startOffset = relative + delta * first;
  const endOffset = relative + delta * last;
  const low = Math.min(startOffset, endOffset);
  const high = Math.max(startOffset, endOffset);
  const firstEdge = Math.ceil(low - 0.5) + 0.5;
  if (delta > 0) {
    for (let edge = firstEdge; edge < high; edge++) {
      const time = (edge - relative) / delta;
      if (time > first && time < last) times.push(time);
    }
  } else {
    for (let edge = Math.ceil(high - 0.5) - 0.5; edge >= firstEdge; edge--) {
      const time = (edge - relative) / delta;
      if (time > first && time < last) times.push(time);
    }
  }
}

export function blocks(body, start, end, other, overlaps, rect = obstacle(body, other)) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // Clip the line to the region where the two mask rectangles can overlap.
  let first = 0;
  let last = 1;
  if (dx) {
    const left = (rect.left - 0.5 - start.x) / dx;
    const right = (rect.right + 0.5 - start.x) / dx;
    first = Math.max(first, Math.min(left, right));
    last = Math.min(last, Math.max(left, right));
    if (first > last) return false;
  } else if (start.x < rect.left - 0.5 || start.x > rect.right + 0.5) {
    return false;
  }
  if (dy) {
    const top = (rect.top - 0.5 - start.y) / dy;
    const bottom = (rect.bottom + 0.5 - start.y) / dy;
    first = Math.max(first, Math.min(top, bottom));
    last = Math.min(last, Math.max(top, bottom));
    if (first > last) return false;
  } else if (start.y < rect.top - 0.5 || start.y > rect.bottom + 0.5) {
    return false;
  }

  const overlapsAt = overlaps === glyphsOverlap
    ? t => overlapAt(body.mask, other.mask, start.x + dx * t, start.y + dy * t, other.x, other.y)
    : t => overlaps({ ...body, x: start.x + dx * t, y: start.y + dy * t }, other);
  if (overlapsAt(first)) return true;
  // Glyph overlap stays constant between half-pixel changes in relative position.
  const times = [];
  if (dx) addCrossings(times, start.x + body.mask.left - other.x - other.mask.left, dx, first, last);
  if (dy) addCrossings(times, start.y + body.mask.top - other.y - other.mask.top, dy, first, last);
  if (dx && dy) times.sort((a, b) => a - b);
  let previous = first;
  for (const time of times) {
    if (overlapsAt(time) || overlapsAt((previous + time) / 2)) return true;
    previous = time;
  }
  return overlapsAt(last) || overlapsAt((previous + last) / 2);
}

export function canSlideFormation(bodies, from, to, overlaps, bounds) {
  const glyphCollision = overlaps === glyphsOverlap;
  const starts = bodies.map((body, i) => {
    const x = body.bounds.left - body.letter.x + from[i * 2];
    const y = body.bounds.top - body.letter.y + from[i * 2 + 1];
    return glyphCollision ? { x, y, mask: body.mask } : { ...body, x, y };
  });
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    const start = starts[i];
    if (bounds) {
      const endX = a.bounds.left - a.letter.x + to[i * 2];
      const endY = a.bounds.top - a.letter.y + to[i * 2 + 1];
      const padding = 0.02;
      if (Math.min(start.x, endX) < bounds.left - padding ||
          Math.max(start.x, endX) + a.bounds.width > bounds.right + padding ||
          Math.min(start.y, endY) < bounds.top - padding ||
          Math.max(start.y, endY) + a.bounds.height > bounds.bottom + padding) return false;
    }
    const moveX = to[i * 2] - from[i * 2];
    const moveY = to[i * 2 + 1] - from[i * 2 + 1];
    for (let j = i + 1; j < bodies.length; j++) {
      const other = starts[j];
      const dx = moveX - to[j * 2] + from[j * 2];
      const dy = moveY - to[j * 2 + 1] + from[j * 2 + 1];
      if (!dx && !dy) {
        if (overlaps(start, other)) return false;
        continue;
      }
      if (blocks(a, start, { x: start.x + dx, y: start.y + dy }, other, overlaps)) return false;
    }
  }
  return true;
}

function splitCurve(values) {
  const work = values.slice();
  const first = [work[0]];
  const last = new Array(work.length);
  last[work.length - 1] = work.at(-1);
  for (let length = work.length - 1; length > 0; length--) {
    for (let i = 0; i < length; i++) work[i] = (work[i + 1] + work[i]) / 2;
    first.push(work[0]);
    last[length - 1] = work[length - 1];
  }
  return [first, last];
}

// A Bézier curve stays inside its control hull. Check every rounded mask
// offset in that hull, subdividing when the rectangle is too conservative.
function clearCurvePair(a, b, xs, ys, depth = 0) {
  const left = Math.max(1 - b.width, Math.round(Math.min(...xs)));
  const right = Math.min(a.width - 1, Math.round(Math.max(...xs)));
  const top = Math.max(1 - b.height, Math.round(Math.min(...ys)));
  const bottom = Math.min(a.height - 1, Math.round(Math.max(...ys)));
  if (left > right || top > bottom) return true;
  if ((right - left + 1) * (bottom - top + 1) <= 48 || depth === 8) {
    let blocked = false;
    for (let y = top; y <= bottom && !blocked; y++) {
      for (let x = left; x <= right && !blocked; x++) blocked = masksOverlap(a, b, x, y);
    }
    if (!blocked) return true;
    if (depth === 8 || (left === right && top === bottom)) return false;
  }
  const [x1, x2] = splitCurve(xs);
  const [y1, y2] = splitCurve(ys);
  return clearCurvePair(a, b, x1, y1, depth + 1) && clearCurvePair(a, b, x2, y2, depth + 1);
}

export function canCurveFormation(bodies, controls) {
  const xs = new Array(controls.length);
  const ys = new Array(controls.length);
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j];
      const x = b.bounds.left - b.letter.x + b.mask.left - (a.bounds.left - a.letter.x + a.mask.left);
      const y = b.bounds.top - b.letter.y + b.mask.top - (a.bounds.top - a.letter.y + a.mask.top);
      for (let step = 0; step < controls.length; step++) {
        const pose = controls[step];
        xs[step] = x + pose[j * 2] - pose[i * 2];
        ys[step] = y + pose[j * 2 + 1] - pose[i * 2 + 1];
      }
      if (!clearCurvePair(a.mask, b.mask, xs, ys)) return false;
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
    const runs = a.mask.rows[row];
    const otherRuns = b.mask.rows[row - dy];
    let i = 0, j = 0;
    while (i < runs.length && j < otherRuns.length) {
      const [left, right] = runs[i];
      const [otherLeft, otherRight] = otherRuns[j];
      const rightEdge = otherRight + dx;
      const start = Math.max(left, otherLeft + dx);
      const end = Math.min(right, rightEdge);
      if (end > start) {
        const count = end - start;
        ink += count;
        x += count * (start + end) / 2;
        y += count * (row + 0.5);
      }
      if (right <= rightEdge) i++;
      if (rightEdge <= right) j++;
    }
  }
  return ink ? { x: a.x + a.mask.left + x / ink, y: a.y + a.mask.top + y / ink } : null;
}
