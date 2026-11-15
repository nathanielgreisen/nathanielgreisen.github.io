const poseDistance = (a, b) => {
  let largest = 0;
  for (let i = 0; i < a.length; i += 2) {
    largest = Math.max(largest, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]));
  }
  return largest;
};

const mix = (a, b, t) => a.map((value, index) => value + (b[index] - value) * t);

function checked(points, clear) {
  return points.every((point, i) => i === 0 || clear(points[i - 1], point));
}

export function curveLetterRoute(route, clear, random = Math.random) {
  const rounded = [route[0]];
  for (let i = 1; i < route.length - 1; i++) {
    const before = route[i - 1];
    const corner = route[i];
    const after = route[i + 1];
    const incoming = poseDistance(before, corner);
    const outgoing = poseDistance(corner, after);
    const cut = Math.min(15, incoming * 0.23, outgoing * 0.23);
    if (cut < 2) {
      rounded.push(corner);
      continue;
    }
    const start = mix(corner, before, cut / incoming);
    const end = mix(corner, after, cut / outgoing);
    const bend = [start, ...[0.25, 0.5, 0.75].map(t =>
      mix(mix(start, corner, t), mix(corner, end, t), t)), end];
    rounded.push(...(checked([rounded.at(-1), ...bend], clear) ? bend : [corner]));
  }
  if (route.length > 1) rounded.push(route.at(-1));

  const result = [rounded[0]];
  for (let i = 1; i < rounded.length; i++) {
    const from = rounded[i - 1];
    const to = rounded[i];
    if (poseDistance(from, to) < 20) {
      result.push(to);
      continue;
    }
    const offsets = new Float64Array(from.length);
    for (let axis = 0; axis < from.length; axis += 2) {
      const dx = to[axis] - from[axis];
      const dy = to[axis + 1] - from[axis + 1];
      const distance = Math.hypot(dx, dy);
      if (distance < 20) continue;
      const bend = Math.min(22, distance * 0.15) * (0.55 + random() * 0.45);
      const direction = random() < 0.5 ? -1 : 1;
      offsets[axis] = -dy / distance * bend * direction;
      offsets[axis + 1] = dx / distance * bend * direction;
    }
    let chosen = [to];
    for (const strength of [1, -1, 0.45, -0.45]) {
      const points = [from];
      for (let step = 1; step < 10; step++) {
        const t = step / 10;
        const arc = Math.sin(Math.PI * t) ** 2 * strength;
        points.push(mix(from, to, t).map((value, j) => value + offsets[j] * arc));
      }
      points.push(to);
      if (checked(points, clear)) {
        chosen = points.slice(1);
        break;
      }
    }
    result.push(...chosen);
  }
  return result;
}

export function prepareLetterPlayback(route, random = Math.random) {
  const lengths = [0];
  for (let i = 1; i < route.length; i++) {
    lengths.push(lengths[i - 1] + poseDistance(route[i - 1], route[i]));
  }
  const pace = { strength: 0.1 + random() * 0.13, phase: random() * Math.PI * 2,
    frequency: (1 + Math.floor(random() * 3)) * Math.PI * 2 };
  return { route, lengths, total: lengths.at(-1), segment: 1, pace };
}

export function sampleLetterRecovery(trip, progress) {
  const { route, lengths, total } = trip;
  if (progress >= 1 || !total) return route.at(-1);
  const ramp = 0.18;
  const rampDistance = time => {
    const t = time / ramp;
    return ramp * t ** 3 * (1 - t / 2);
  };
  const distanceTraveled = progress < ramp ? rampDistance(progress) :
    progress > 1 - ramp ? 1 - ramp - rampDistance(1 - progress) : progress - ramp / 2;
  const linear = distanceTraveled / (1 - ramp);
  const { strength, phase, frequency } = trip.pace;
  const pulse = (Math.sin(phase + frequency * linear) - Math.sin(phase)) * strength / frequency;
  const distance = total * (linear + pulse);
  while (trip.segment < route.length - 1 && lengths[trip.segment] <= distance) trip.segment++;
  const i = trip.segment;
  const fraction = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
  const from = route[i - 1];
  const to = route[i];
  return mix(from, to, fraction);
}
