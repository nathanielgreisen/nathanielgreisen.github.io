const poseDistance = (a, b) => {
  let largest = 0;
  for (let i = 0; i < a.length; i += 2) {
    largest = Math.max(largest, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]));
  }
  return largest;
};

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
    const route = [poses.at(-1)];
    const interpolate = [false];
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
  const distance = total * progress * progress * (3 - 2 * progress);
  while (trip.segment < route.length - 1 && lengths[trip.segment] <= distance) trip.segment++;
  const i = trip.segment;
  if (!trip.interpolate[i]) return route[i - 1];
  const fraction = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
  const from = route[i - 1];
  const to = route[i];
  return from.map((value, index) => value + (to[index] - value) * fraction);
}
