const poseDistance = (a, b) => {
  let largest = 0;
  for (let i = 0; i < a.length; i += 2) {
    largest = Math.max(largest, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]));
  }
  return largest;
};

function travelCost(a, b) {
  let travel = 0;
  for (let i = 0; i < a.length; i += 2) {
    travel += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]);
  }
  // Prefer less movement overall and fewer changes of direction.
  return travel + 6;
}

function shorterRoute(candidates, clear) {
  const last = candidates.length - 1;
  const costs = candidates.map(() => Infinity);
  const parents = candidates.map(() => -1);
  costs[0] = 0;
  for (let end = 1; end <= last; end++) {
    for (let start = 0; start < end; start++) {
      const cost = costs[start] + travelCost(candidates[start], candidates[end]);
      if (cost >= costs[end] || !clear(candidates[start], candidates[end])) continue;
      costs[end] = cost;
      parents[end] = start;
    }
  }
  if (parents[last] < 0) return null;
  const route = [];
  for (let i = last; i >= 0; i = parents[i]) route.unshift(candidates[i]);
  return { route, cost: costs[last] };
}

export function createLetterHistory(count) {
  const origin = new Float32Array(count * 2);
  let poses = [origin];

  function record(pose) {
    if (poseDistance(poses.at(-1), pose) > 0.001) poses.push(pose);
  }

  function reset() {
    poses = [origin];
  }

  function buildRoute(current, clear) {
    record(current);
    let route = [poses.at(-1)];
    let interpolate = [false];
    let cursor = poses.length - 1;
    while (cursor > 0) {
      // Prefer a coordinated shortcut, falling back to the recorded contact steps.
      let earlier = 0;
      if (cursor > 1 && !clear(poses[cursor], origin)) {
        let stride = Math.min(256, cursor);
        while (stride > 1 && !clear(poses[cursor], poses[cursor - stride])) stride >>= 1;
        earlier = cursor - stride;
      }
      route.push(poses[earlier]);
      interpolate.push(cursor - earlier > 1 || clear(poses[cursor], poses[earlier]));
      cursor = earlier;
    }

    if (route.length > 2) {
      const candidates = new Set([0, poses.length - 1]);
      for (let i = 1; i < 16; i++) candidates.add(Math.round(i * (poses.length - 1) / 16));
      const samples = [...candidates].sort((a, b) => b - a).map(index => poses[index]);
      const currentCost = route.slice(1).reduce((sum, pose, i) => sum + travelCost(route[i], pose), 0);
      const anchored = Array.from({ length: count }, (_, index) =>
        Math.hypot(current[index * 2], current[index * 2 + 1]) < 0.01);
      const fixed = samples.map((pose, i) => i === 0 ? current :
        pose.map((value, axis) => anchored[Math.floor(axis / 2)] ? 0 : value));
      const alternatives = [shorterRoute(fixed, clear), shorterRoute(samples, clear)];
      const best = alternatives.find(option => option && option.cost < currentCost);
      if (best) {
        route = best.route;
        interpolate = route.map((_, i) => i > 0);
      }
    }

    const lengths = [0];
    for (let i = 1; i < route.length; i++) {
      lengths.push(lengths[i - 1] + poseDistance(route[i - 1], route[i]));
    }
    return { route, lengths, interpolate, total: lengths.at(-1), segment: 1 };
  }

  return { record, reset, buildRoute };
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
  const distance = total * distanceTraveled / (1 - ramp);
  while (trip.segment < route.length - 1 && lengths[trip.segment] <= distance) trip.segment++;
  const i = trip.segment;
  if (!trip.interpolate[i]) return route[i - 1];
  const fraction = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
  const from = route[i - 1];
  const to = route[i];
  return from.map((value, index) => value + (to[index] - value) * fraction);
}
