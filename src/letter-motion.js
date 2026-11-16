export function impactAngle(body, other, axis, impulse, random) {
  const side = axis === "x" ? "y" : "x";
  const span = side === "x" ? "width" : "height";
  const offset = other[side] + other.bounds[span] / 2 - body[side] - body.bounds[span] / 2;
  const alignment = Math.max(-1, Math.min(1, offset / (other.bounds[span] / 2)));
  const variation = 0.06 + random() * 0.11;
  const direction = Math.abs(alignment) > 0.1 ? Math.sign(alignment) : random() < 0.5 ? -1 : 1;
  return (variation + 0.12 * Math.abs(alignment)) * direction * Math.sign(impulse);
}

export const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function spinFromFlick(vx, vy, grabX, grabY, pivot, inertia) {
  const speed = Math.hypot(vx, vy);
  if (!speed) return 0;
  const torque = (grabX - pivot.x) * vy - (grabY - pivot.y) * vx;
  // A nearly centered grip has no useful lever arm.
  return Math.abs(torque) / speed > 3 ? torque * 0.32 / inertia : 0;
}

export function contactImpulse(body, other, point, axis, direction, random) {
  const arm = (entry) => ({
    x: point.x - entry.x - (entry.pivot?.x ?? entry.bounds.width / 2),
    y: point.y - entry.y - (entry.pivot?.y ?? entry.bounds.height / 2),
  });
  const a = arm(body), b = arm(other);
  const inertia = entry => entry.inertia ?? (entry.bounds.width ** 2 + entry.bounds.height ** 2) / 12;
  const ia = inertia(body), ib = inertia(other);
  const tangentA = axis === "x" ? -a.y : a.x;
  const tangentB = axis === "x" ? -b.y : b.x;
  const speedKey = axis === "x" ? "vx" : "vy";
  const relative = body.letter[speedKey] + (body.letter.omega ?? 0) * tangentA -
    other.letter[speedKey] - (other.letter.omega ?? 0) * tangentB;
  if (relative * direction <= 0) return false;

  const restitution = 0.92 + random() * 0.06;
  const impulse = (1 + restitution) * relative /
    (2 + tangentA ** 2 / ia + tangentB ** 2 / ib);
  const angle = impactAngle(body, other, axis, impulse, random);
  const along = Math.cos(angle) * impulse;
  const across = Math.sin(angle) * impulse;
  const x = axis === "x" ? along : across;
  const y = axis === "y" ? along : across;
  body.letter.vx -= x;
  body.letter.vy -= y;
  other.letter.vx += x;
  other.letter.vy += y;
  // In screen coordinates, a downward impulse left of center produces negative rotation.
  body.letter.omega = (body.letter.omega ?? 0) - (a.x * y - a.y * x) / ia;
  other.letter.omega = (other.letter.omega ?? 0) + (b.x * y - b.y * x) / ib;
  return true;
}
