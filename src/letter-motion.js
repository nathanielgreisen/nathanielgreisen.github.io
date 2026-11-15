export function planLetterReturn(x, y, random = Math.random) {
  const distance = Math.hypot(x, y);
  const duration = Math.min(5, distance / 100);
  const windUp = Math.min(0.24, duration * 0.28);
  const pullback = Math.min(9, distance * 0.09) * (0.7 + random() * 0.3);
  const bend = Math.min(21, distance * 0.12) * (random() < 0.5 ? -1 : 1) * (0.55 + random() * 0.45);
  return { x, y, distance, duration, windUp, pullback, bend, elapsed: 0, detoured: false };
}

export function sampleLetterReturn(plan, elapsed) {
  const { x, y, distance, duration, windUp, pullback, bend } = plan;
  if (elapsed >= duration) return { x: 0, y: 0 };

  const backward = pullback / distance;
  if (elapsed < windUp) {
    const t = elapsed / windUp;
    const offset = 1 + backward * t * t * (3 - 2 * t);
    return { x: x * offset, y: y * offset };
  }

  const glideTime = duration - windUp;
  const ramp = Math.min(0.34, glideTime * 0.28);
  const time = elapsed - windUp;
  const total = glideTime - ramp;
  // Integrate smooth acceleration and braking around a steady middle section.
  const easedDistance = t => {
    const fraction = t / ramp;
    return ramp * fraction ** 3 * (1 - fraction / 2);
  };
  const traveled = time < ramp ? easedDistance(time) : time > glideTime - ramp
    ? total - easedDistance(glideTime - time)
    : time - ramp / 2;
  const progress = traveled / total;
  const offset = (1 + backward) * (1 - progress);
  const curve = bend * Math.sin(Math.PI * progress) ** 2 / distance;
  return { x: x * offset - y * curve, y: y * offset + x * curve };
}

export function impactAngle(body, other, axis, impulse, random) {
  const side = axis === "x" ? "y" : "x";
  const span = side === "x" ? "width" : "height";
  const offset = other[side] + other.bounds[span] / 2 - body[side] - body.bounds[span] / 2;
  const alignment = Math.max(-1, Math.min(1, offset / (other.bounds[span] / 2)));
  const variation = 0.06 + random() * 0.11;
  const direction = Math.abs(alignment) > 0.1 ? Math.sign(alignment) : random() < 0.5 ? -1 : 1;
  return (variation + 0.12 * Math.abs(alignment)) * direction * Math.sign(impulse);
}
