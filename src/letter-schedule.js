import { canSlideFormation, glyphsOverlap } from "./letter-navigation.js";

const samePoint = (a, b) => a.x === b.x && a.y === b.y;
const travel = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function makeTracks(route) {
  const times = [0];
  for (let step = 1; step < route.length; step++) {
    let length = 0;
    for (let axis = 0; axis < route[step].length; axis += 2) {
      length = Math.max(length, Math.hypot(route[step][axis] - route[step - 1][axis],
        route[step][axis + 1] - route[step - 1][axis + 1]));
    }
    times.push(times.at(-1) + length);
  }
  const total = times.at(-1);
  return Array.from({ length: route[0].length / 2 }, (_, index) => {
    const track = route.map((pose, step) => ({
      time: total ? times[step] / total : 0, x: pose[index * 2], y: pose[index * 2 + 1],
    }));
    return track.filter((point, i) => !i || i === track.length - 1 ||
      !samePoint(point, track[i - 1]) || !samePoint(point, track[i + 1]));
  });
}

function at(track, time) {
  let next = 1;
  while (next < track.length && track[next].time < time) next++;
  if (next === track.length) return track.at(-1);
  const a = track[next - 1];
  const b = track[next];
  if (time <= a.time || a.time === b.time) return a;
  if (time === b.time) return b;
  const t = (time - a.time) / (b.time - a.time);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function compatible(a, b, bodies, bounds) {
  const times = [...new Set([...a, ...b].map(point => point.time))].sort((l, r) => l - r);
  let previous;
  for (const time of times) {
    const first = at(a, time);
    const second = at(b, time);
    const pose = [first.x, first.y, second.x, second.y];
    if (previous && !canSlideFormation(bodies, previous, pose, glyphsOverlap, bounds)) return false;
    previous = pose;
  }
  return true;
}

function timing(track) {
  const moves = [];
  let length = 0;
  for (let step = 1; step < track.length; step++) {
    if (samePoint(track[step - 1], track[step])) continue;
    length += travel(track[step - 1], track[step]);
    moves.push({ start: track[step - 1], end: track[step], length });
  }
  return { moves, length, first: moves[0]?.start.time, last: moves.at(-1)?.end.time };
}

function inWindow(track, info, start, end, keepPauses) {
  const points = [{ ...track[0], time: 0 }];
  const place = (point, fraction) => {
    const time = fraction === 1 ? end : start + (end - start) * fraction;
    if (time !== points.at(-1).time || !samePoint(point, points.at(-1))) {
      points.push({ ...point, time });
    }
  };
  if (keepPauses) {
    for (const point of track) {
      if (point.time >= info.first && point.time <= info.last) {
        place(point, (point.time - info.first) / (info.last - info.first));
      }
    }
  } else {
    place(info.moves[0].start, 0);
    for (const move of info.moves) place(move.end, move.length / info.length);
  }
  if (end < 1) points.push({ ...track.at(-1), time: 1 });
  return points;
}

function activity(track) {
  return Array.from({ length: 24 }, (_, i) =>
    travel(at(track, i / 24), at(track, (i + 1) / 24)) > 0.35 ? 1 : 0);
}

function score(candidate, others, goal) {
  return candidate.reduce((sum, moving, i) => {
    const concurrent = others[i] + moving;
    return sum + Math.min(goal, concurrent) * (1 + i / candidate.length) +
      (concurrent >= 2 ? 2 : 0);
  }, 0);
}

function toRoute(tracks) {
  const times = [...new Set(tracks.flatMap(track => track.map(point => point.time)))].sort((a, b) => a - b);
  return times.map(time => Float64Array.from(tracks.flatMap(track => {
    const point = at(track, time);
    return [point.x, point.y];
  })));
}

export function overlapLetterMoves(route, bodies, bounds) {
  if (route.length < 3) return route;
  const tracks = makeTracks(route);
  const infos = tracks.map(timing);
  const active = infos.flatMap((info, index) => info.moves.length ? [index] : []);
  if (active.length < 2) return route;

  // First try a shared start and finish. Keep the original ordering as the safe baseline.
  const synchronized = tracks.map((track, i) =>
    infos[i].moves.length ? inWindow(track, infos[i], 0, 1, false) : track);
  if (active.every(i => tracks.every((_, j) => i === j ||
    compatible(synchronized[i], synchronized[j], [bodies[i], bodies[j]], bounds)))) {
    return toRoute(synchronized);
  }

  const samples = tracks.map(activity);
  const arrivals = infos.map(info => info.last);
  const goal = Math.min(3, active.length);
  active.sort((a, b) => infos[a].last - infos[b].last);
  for (const index of active) {
    const info = infos[index];
    const others = samples[index].map((_, i) =>
      samples.reduce((sum, sample, j) => sum + (j === index ? 0 : sample[i]), 0));
    const groups = new Map();
    for (const peer of active) {
      if (peer === index) continue;
      const arrival = arrivals[peer];
      groups.set(arrival, (groups.get(arrival) ?? 0) + 1);
    }
    // Reward shared arrivals as well as keeping several letters in motion.
    const scoreArrival = end => 6 * Math.min(4, groups.get(end) ?? 0) + 2 * end;
    let best = score(samples[index], others, goal) + scoreArrival(arrivals[index]);
    let chosen = tracks[index];
    let chosenSamples = samples[index];
    let chosenEnd = arrivals[index];
    const starts = [...new Set([0, info.first / 2, info.first, 0.25, 0.5, 0.75])];
    const groupTimes = [...groups.keys()].sort((a, b) =>
      groups.get(b) - groups.get(a) || Math.abs(a - info.last) - Math.abs(b - info.last));
    const ends = [...new Set([1, ...groupTimes.slice(0, 4), 0.9, 0.75, info.last])];
    for (const end of ends) {
      for (const start of starts) {
        if (end - start < 0.05) continue;
        for (const preserve of [false, true]) {
          const candidate = inWindow(tracks[index], info, start, end, preserve);
          const candidateSamples = activity(candidate);
          const value = score(candidateSamples, others, goal) + scoreArrival(end);
          if (value <= best || !tracks.every((track, j) => j === index ||
            compatible(candidate, track, [bodies[index], bodies[j]], bounds))) continue;
          chosen = candidate;
          chosenSamples = candidateSamples;
          chosenEnd = end;
          best = value;
        }
      }
    }
    tracks[index] = chosen;
    samples[index] = chosenSamples;
    arrivals[index] = chosenEnd;
  }
  return toRoute(tracks);
}
