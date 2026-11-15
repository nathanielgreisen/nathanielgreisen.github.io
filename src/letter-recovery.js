const poseDistance = (a, b) => {
  let largest = 0;
  for (let i = 0; i < a.length; i += 2) {
    largest = Math.max(largest, Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1]));
  }
  return largest;
};

export function prepareLetterPlayback(route) {
  const lengths = [0];
  for (let i = 1; i < route.length; i++) {
    lengths.push(lengths[i - 1] + poseDistance(route[i - 1], route[i]));
  }
  return { route, lengths, total: lengths.at(-1), segment: 1 };
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
  const fraction = (distance - lengths[i - 1]) / (lengths[i] - lengths[i - 1]);
  const from = route[i - 1];
  const to = route[i];
  return from.map((value, index) => value + (to[index] - value) * fraction);
}
