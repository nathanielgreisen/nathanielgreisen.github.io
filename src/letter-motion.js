export function impactAngle(body, other, axis, impulse, random) {
  const side = axis === "x" ? "y" : "x";
  const span = side === "x" ? "width" : "height";
  const offset = other[side] + other.bounds[span] / 2 - body[side] - body.bounds[span] / 2;
  const alignment = Math.max(-1, Math.min(1, offset / (other.bounds[span] / 2)));
  const distance = Math.abs(alignment);
  const variation = 0.06 + random() * 0.11;
  const direction = distance > 0.1 ? Math.sign(alignment) : random() < 0.5 ? -1 : 1;
  return (variation + 0.12 * distance) * direction * Math.sign(impulse);
}

export const wrapAngle = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function spinFromFlick(vx, vy, grabX, grabY, pivot, inertia) {
  const speed = Math.hypot(vx, vy);
  if (!speed) return 0;
  const torque = (grabX - pivot.x) * vy - (grabY - pivot.y) * vx;
  // A nearly centered grip has no useful lever arm.
  return Math.abs(torque) / speed > 3 ? torque * 0.32 / inertia : 0;
}

function inertia(entry) {
  return entry.inertia ?? (entry.bounds.width ** 2 + entry.bounds.height ** 2) / 12;
}

export function contactImpulse(body, other, point, axis, direction, random) {
  const ax = point.x - body.x - (body.pivot?.x ?? body.bounds.width / 2);
  const ay = point.y - body.y - (body.pivot?.y ?? body.bounds.height / 2);
  const bx = point.x - other.x - (other.pivot?.x ?? other.bounds.width / 2);
  const by = point.y - other.y - (other.pivot?.y ?? other.bounds.height / 2);
  const horizontal = axis === "x";
  const tangentA = horizontal ? -ay : ax;
  const tangentB = horizontal ? -by : bx;
  const speedKey = horizontal ? "vx" : "vy";
  const a = body.letter, b = other.letter;
  const omegaA = a.omega ?? 0, omegaB = b.omega ?? 0;
  const relative = a[speedKey] + omegaA * tangentA - b[speedKey] - omegaB * tangentB;
  if (relative * direction <= 0) return false;

  const ia = inertia(body), ib = inertia(other);
  const restitution = 0.92 + random() * 0.06;
  const impulse = (1 + restitution) * relative /
    (2 + tangentA ** 2 / ia + tangentB ** 2 / ib);
  const angle = impactAngle(body, other, axis, impulse, random);
  const along = Math.cos(angle) * impulse;
  const across = Math.sin(angle) * impulse;
  const x = horizontal ? along : across;
  const y = axis === "y" ? along : across;
  a.vx -= x;
  a.vy -= y;
  b.vx += x;
  b.vy += y;
  // In screen coordinates, a downward impulse left of center produces negative rotation.
  a.omega = omegaA - (ax * y - ay * x) / ia;
  b.omega = omegaB + (bx * y - by * x) / ib;
  return true;
}
