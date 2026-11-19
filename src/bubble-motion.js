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
  const phase = seconds * 2.6;
  const sway = Math.sin(phase) * 7;
  const riseSpeed = bubble.riseSpeed ?? 62 + bubble.radius * 0.34;
  const x = bubble.x + seconds * bubble.drift + sway;
  const y = bubble.y - seconds * riseSpeed;
  if (!bubble.merging || seconds >= 0.32) return { x, y, riseSpeed, radius: bubble.radius };

  const { large, small } = bubble.merging;
  const progress = seconds / 0.32;
  const blend = progress ** 2 * (3 - 2 * progress);
  const opacity = 1 - blend;
  const follow = part => {
    const start = part.age * 2.6;
    const partSway = (Math.sin(start + phase) - Math.sin(start)) * 7;
    return {
      x: x + (part.x + seconds * part.drift + partSway - x) * opacity,
      y: y + (part.y - seconds * part.riseSpeed - y) * opacity,
    };
  };
  const primary = follow(large);
  const tail = follow(small);
  tail.radius = small.radius * Math.sqrt(opacity);
  tail.opacity = opacity;
  primary.riseSpeed = riseSpeed;
  primary.radius = Math.hypot(large.radius, small.radius * Math.sqrt(blend));
  primary.tail = tail;
  return primary;
}
