export function traceGlyphOutline(rows, width) {
  const outline = [];
  const stride = Math.ceil(width / 3);
  const covered = new Uint8Array(stride * Math.ceil(rows.length / 3));
  for (let y = 1; y < rows.length - 1; y++) {
    const cellRow = Math.floor(y / 3) * stride;
    const above = rows[y - 1];
    const below = rows[y + 1];
    let up = 0, down = 0;
    for (const [start, end] of rows[y]) {
      const right = Math.min(width - 1, end);
      for (let x = Math.max(1, start); x < right; x++) {
        const cell = cellRow + Math.floor(x / 3);
        if (covered[cell]) continue;
        if (x > start && x + 1 < end) {
          while (up < above.length && above[up][1] <= x) up++;
          if (up < above.length && above[up][0] <= x) {
            while (down < below.length && below[down][1] <= x) down++;
            if (down < below.length && below[down][0] <= x) {
              // Skip this interior span up to the first possible outline pixel.
              x = Math.min(end - 1, above[up][1], below[down][1]) - 1;
              continue;
            }
          }
        }
        covered[cell] = 1;
        outline.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
  }
  return outline;
}

export function makeLetterWake(body, gridBounds, dt) {
  const vx = (body.x - body.bounds.left) / dt;
  const vy = (body.y - body.bounds.top) / dt;
  const speed = Math.hypot(vx, vy);
  const strength = Math.min(1, Math.max(0, (speed - 12) / 950));
  if (!strength) return null;

  const reach = 13 + strength * 23;
  const trail = 12 + strength * 125;
  const ux = -vx / speed;
  const uy = -vy / speed;
  const x = body.x - gridBounds.left + body.mask.left;
  const y = body.y - gridBounds.top + body.mask.top;
  // Project the outline once so each grid sample can skip distant edges.
  const outline = body.mask.outline.map((edge, index) => ({
    along: edge.x * ux + edge.y * uy,
    across: edge.y * ux - edge.x * uy,
    index,
  }));
  outline.sort((first, second) => first.across - second.across);
  return {
    x, y, ux, uy, trail, reach, strength, outline,
    left: x + Math.min(0, ux * trail) - reach,
    right: x + body.mask.width + Math.max(0, ux * trail) + reach,
    top: y + Math.min(0, uy * trail) - reach,
    bottom: y + body.mask.height + Math.max(0, uy * trail) + reach,
  };
}

export function sampleLetterWake(x, y, wake) {
  if (x < wake.left || x > wake.right || y < wake.top || y > wake.bottom) return null;
  const { outline, trail, reach, strength, ux, uy } = wake;
  const localX = x - wake.x;
  const localY = y - wake.y;
  const along = localX * ux + localY * uy;
  const across = localY * ux - localX * uy;
  const low = across - reach;
  const high = across + reach;
  let start = 0, end = outline.length;
  while (start < end) {
    const mid = (start + end) >>> 1;
    if (outline[mid].across <= low) start = mid + 1;
    else end = mid;
  }
  let force = 0;
  let shiftX = 0;
  let shiftY = 0;
  let bestIndex = Infinity;
  for (let i = start; i < outline.length; i++) {
    const edge = outline[i];
    if (edge.across >= high) break;
    const normal = across - edge.across;
    const forward = along - edge.along;
    if (forward >= trail || forward <= -reach) continue;
    const tail = 1 - Math.max(0, forward) / trail;
    const maxWeight = tail * strength;
    if (maxWeight < force) continue;
    const localReach = reach * (0.4 + 0.6 * tail);
    const excess = Math.min(0, forward);
    const distanceSquared = normal * normal + excess * excess;
    if (distanceSquared >= localReach * localReach) continue;
    const falloff = 1 - Math.sqrt(distanceSquared) / localReach;
    const weight = falloff * falloff * maxWeight;
    if (weight < force || (weight === force && edge.index >= bestIndex)) continue;
    force = weight;
    bestIndex = edge.index;
    shiftX = (excess * ux - normal * uy) * weight * 3.6;
    shiftY = (excess * uy + normal * ux) * weight * 3.6;
  }
  return force ? { shiftX, shiftY, force } : null;
}
