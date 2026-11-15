export function impactAngle(body, other, axis, impulse, random) {
  const side = axis === "x" ? "y" : "x";
  const span = side === "x" ? "width" : "height";
  const offset = other[side] + other.bounds[span] / 2 - body[side] - body.bounds[span] / 2;
  const alignment = Math.max(-1, Math.min(1, offset / (other.bounds[span] / 2)));
  const variation = 0.06 + random() * 0.11;
  const direction = Math.abs(alignment) > 0.1 ? Math.sign(alignment) : random() < 0.5 ? -1 : 1;
  return (variation + 0.12 * Math.abs(alignment)) * direction * Math.sign(impulse);
}
