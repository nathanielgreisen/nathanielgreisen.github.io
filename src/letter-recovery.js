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
  const home = route.at(-1);
  const arrivals = new Uint8Array(route.length);
  for (let axis = 0; axis < home.length; axis += 2) {
    let i = route.length - 2;
    while (i >= 0 && route[i][axis] === home[axis] && route[i][axis + 1] === home[axis + 1]) i--;
    if (i >= 0) arrivals[i + 1]++;
  }
  const rounded = [route[0]];
  for (let i = 1; i < route.length - 1; i++) {
    const before = route[i - 1];
    const corner = route[i];
    const after = route[i + 1];
    const incoming = poseDistance(before, corner);
    const outgoing = poseDistance(corner, after);
    const cut = Math.min(15, incoming * 0.23, outgoing * 0.23);
    // Keep the shared home pose as a waypoint so the whole group lands on it.
    if (cut < 2 || arrivals[i] > 1) {
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

export function prepareLetterPlayback(route, random = Math.random, curveClear = () => true) {
  route = route.filter((pose, i) => !i || poseDistance(route[i - 1], pose) > 1e-8);
  const lengths = [0];
  for (let i = 1; i < route.length; i++) {
    lengths.push(lengths[i - 1] + poseDistance(route[i - 1], route[i]));
  }
  const pace = { strength: 0.1 + random() * 0.13, phase: random() * Math.PI * 2,
    frequency: (1 + Math.floor(random() * 3)) * Math.PI * 2 };
  const velocities = route.map((pose, i) => pose.map((value, axis) => {
    if (!i || i === route.length - 1) return 0;
    const incoming = (value - route[i - 1][axis]) / (lengths[i] - lengths[i - 1]);
    const outgoing = (route[i + 1][axis] - value) / (lengths[i + 1] - lengths[i]);
    return incoming * outgoing > 0 ? Math.sign(incoming) * Math.min(Math.abs(incoming), Math.abs(outgoing)) : 0;
  }));
  function controls(i) {
    const from = route[i - 1];
    const to = route[i];
    const handle = (lengths[i] - lengths[i - 1]) / 5;
    // Matching endpoint velocities and zero endpoint acceleration give C² joins.
    return [from, from.map((x, j) => x + handle * velocities[i - 1][j]),
      from.map((x, j) => x + 2 * handle * velocities[i - 1][j]),
      to.map((x, j) => x - 2 * handle * velocities[i][j]),
      to.map((x, j) => x - handle * velocities[i][j]), to];
  }
  const segments = [];
  for (let i = 1; i < route.length; i++) {
    const curve = controls(i);
    if ((velocities[i - 1].some(Boolean) || velocities[i].some(Boolean)) && !curveClear(curve)) {
      // Keep the verified straight segment and ease through a stop at its ends.
      velocities[i - 1].fill(0);
      velocities[i].fill(0);
      if (i > 1) {
        i -= 2;
        continue;
      }
    }
    segments[i] = controls(i);
  }
  return { route, segments, lengths, total: lengths.at(-1), pace };
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
  let i = 1;
  while (i < route.length - 1 && lengths[i] <= distance) i++;
  const fraction = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
  const t = Math.max(0, Math.min(1, fraction));
  const u = 1 - t;
  const weights = [u ** 5, 5 * u ** 4 * t, 10 * u ** 3 * t ** 2,
    10 * u ** 2 * t ** 3, 5 * u * t ** 4, t ** 5];
  return route[i].map((_, axis) =>
    trip.segments[i].reduce((value, point, j) => value + point[axis] * weights[j], 0));
}
