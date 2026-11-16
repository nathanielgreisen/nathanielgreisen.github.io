export function beginBubbleMerge(a, b, time) {
  const [large, small] = a.radius >= b.radius ? [a, b] : [b, a];
  const area = large.radius ** 2 + small.radius ** 2;
  const weight = small.radius ** 2 / area;
  const towardSmall = (first, second) => first + (second - first) * weight;
  return {
    ambient: a.ambient && b.ambient,
    x: towardSmall(large.x, small.x),
    y: towardSmall(large.y, small.y),
    drift: towardSmall(large.drift, small.drift),
    riseSpeed: towardSmall(large.riseSpeed, small.riseSpeed),
    radius: Math.sqrt(area),
    released: time,
    merging: { large, small },
  };
}

export function sampleBubbleMotion(bubble, time) {
  const seconds = Math.max(0, time - bubble.released) / 1000;
  const sway = Math.sin(seconds * 2.6) * 7;
  const riseSpeed = bubble.riseSpeed ?? 62 + bubble.radius * 0.34;
  const x = bubble.x + seconds * bubble.drift + sway;
  const y = bubble.y - seconds * riseSpeed;
  const progress = Math.min(1, seconds / 0.32);
  if (!bubble.merging || progress === 1) return { x, y, riseSpeed, radius: bubble.radius };

  const { large, small } = bubble.merging;
  const blend = progress ** 2 * (3 - 2 * progress);
  const follow = part => {
    const phase = part.age * 2.6;
    const partSway = (Math.sin(phase + seconds * 2.6) - Math.sin(phase)) * 7;
    return {
      x: x + (part.x + seconds * part.drift + partSway - x) * (1 - blend),
      y: y + (part.y - seconds * part.riseSpeed - y) * (1 - blend),
    };
  };
  return {
    ...follow(large),
    riseSpeed,
    radius: Math.hypot(large.radius, small.radius * Math.sqrt(blend)),
    tail: { ...follow(small), radius: small.radius * Math.sqrt(1 - blend), opacity: 1 - blend },
  };
}
