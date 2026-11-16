export function traceGlyphOutline(pixels, width, height) {
  const outline = [];
  const covered = new Set();
  const hasInk = (x, y) => pixels[(y * width + x) * 4 + 3] >= 128;
  const stride = Math.ceil(width / 3);
  // The glyph mask has a transparent border, so every neighbor is in bounds.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!hasInk(x, y) ||
          (hasInk(x - 1, y) && hasInk(x + 1, y) && hasInk(x, y - 1) && hasInk(x, y + 1))) continue;
      const cell = Math.floor(y / 3) * stride + Math.floor(x / 3);
      if (covered.has(cell)) continue;
      covered.add(cell);
      outline.push({ x: x + 0.5, y: y + 0.5 });
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
  return {
    x, y, ux, uy, trail, reach, strength, outline: body.mask.outline,
    left: x + Math.min(0, ux * trail) - reach,
    right: x + body.mask.width + Math.max(0, ux * trail) + reach,
    top: y + Math.min(0, uy * trail) - reach,
    bottom: y + body.mask.height + Math.max(0, uy * trail) + reach,
  };
}

export function sampleLetterWake(x, y, wake) {
  if (x < wake.left || x > wake.right || y < wake.top || y > wake.bottom) return null;
  const localX = x - wake.x;
  const localY = y - wake.y;
  let force = 0;
  let shiftX = 0;
  let shiftY = 0;
  for (const edge of wake.outline) {
    const dx = localX - edge.x;
    const dy = localY - edge.y;
    // Sweep each point on the glyph's edge backward along the motion.
    const along = Math.max(0, Math.min(wake.trail, dx * wake.ux + dy * wake.uy));
    const tail = 1 - along / wake.trail;
    const reach = wake.reach * (0.4 + 0.6 * tail);
    const sideX = dx - along * wake.ux;
    const sideY = dy - along * wake.uy;
    const distanceSquared = sideX * sideX + sideY * sideY;
    if (distanceSquared >= reach * reach) continue;
    const falloff = 1 - Math.sqrt(distanceSquared) / reach;
    const weight = falloff * falloff * tail * wake.strength;
    if (weight <= force) continue;
    force = weight;
    shiftX = sideX * weight * 3.6;
    shiftY = sideY * weight * 3.6;
  }
  return force ? { shiftX, shiftY, force } : null;
}
