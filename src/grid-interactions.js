import { sampleLetterWake } from "./letter-wake.js";

export function mountPageInteractions(container) {
  const controller = new AbortController();
  const { signal } = controller;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = container.querySelector(".intro-grid");
  const grid = canvas && setupGrid(canvas, reducedMotion, signal);

  return {
    grid,
    reducedMotion,
    signal,
    dispose() {
      controller.abort();
      grid?.dispose();
    },
  };
}

function setupGrid(canvas, reducedMotion, signal) {
  const intro = canvas.parentElement;
  const context = canvas.getContext("2d");
  if (!context) return;
  const pointer = { x: 0, y: 0, inside: false };
  const bend = { x: 0, y: 0, strength: 0 };
  const lineFields = [];
  const lineWakes = [];
  const firstPoint = {};
  const secondPoint = {};
  let width = 0;
  let height = 0;
  let scale = 1;
  let frame = 0;
  let lastRegion = null;
  let horizontalAlpha;
  let baseContext;

  let liveBubbles = [];
  const bubbleFields = [];
  let gridHasBubbles = false;
  let letterWakes = [];

  function refreshBubbleFields(scrollY, bounds) {
    bubbleFields.length = 0;
    if (!liveBubbles.length) return;
    bounds ??= canvas.getBoundingClientRect();
    const pageTop = bounds.top + scrollY;
    for (const bubble of liveBubbles) {
      const reach = bubble.radius * 2.3;
      const x = bubble.x - bounds.left;
      const y = bubble.y - pageTop;
      if (x + reach < 0 || x - reach > width || y + reach < 0 || y - reach > height) continue;
      bubbleFields.push({ x, y, reach });
    }
  }

  function warpPoint(x, y, point) {
    const dx = x - bend.x;
    const dy = y - bend.y;
    const cursorForce = bend.strength && Math.abs(dx) < 110 && Math.abs(dy) < 110
      ? Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 110) ** 2 * bend.strength : 0;
    let shiftX = dx * cursorForce;
    let shiftY = dy * cursorForce;
    let bubbleHighlight = 0;
    let letterHighlight = 0;

    for (const field of lineFields) {
      const bx = x - field.x;
      const by = y - field.y;
      if (Math.abs(bx) >= field.reach || Math.abs(by) >= field.reach) continue;
      const falloff = Math.max(0, 1 - Math.sqrt(bx * bx + by * by) / field.reach);
      const force = falloff ** 2 * 1.5;
      shiftX += bx * force;
      shiftY += by * force;
      bubbleHighlight = Math.max(bubbleHighlight, force);
    }

    for (const wake of lineWakes) {
      const sample = sampleLetterWake(x, y, wake);
      if (!sample) continue;
      shiftX += sample.shiftX;
      shiftY += sample.shiftY;
      letterHighlight = Math.max(letterHighlight, sample.force);
    }

    const shiftSquared = shiftX * shiftX + shiftY * shiftY;
    const scale = shiftSquared > 42 ** 2 ? 42 / Math.sqrt(shiftSquared) : 1;
    point.x = x + shiftX * scale;
    point.y = y + shiftY * scale;
    point.cursorHighlight = 0.33 * cursorForce;
    point.bubbleHighlight = 0.24 * bubbleHighlight;
    point.letterHighlight = 0.32 * letterHighlight;
  }

  function baseAlpha(x) {
    return 0.025 + 0.11 * Math.max(0, (x - width * 0.2) / Math.max(1, width * 0.8));
  }

  function stroke(target, startX, startY, endX, endY, alpha) {
    target.globalAlpha = alpha;
    target.beginPath();
    target.moveTo(startX, startY);
    target.lineTo(endX, endY);
    target.stroke();
  }

  function paint(target, region, fields, wakes, cursor) {
    const spacing = 24;
    for (const vertical of [false, true]) {
      const limit = vertical ? width : height;
      const length = vertical ? height : width;
      const fixedStart = vertical ? region.left : region.top;
      const fixedEnd = vertical ? region.right : region.bottom;
      const lineStart = vertical ? region.top : region.left;
      const lineEnd = vertical ? region.bottom : region.right;
      const firstFixed = Math.max(0, Math.ceil((fixedStart - 0.5) / spacing)) * spacing + 0.5;
      const firstOffset = Math.max(0, Math.floor(lineStart / 8) * 8);
      for (let fixed = firstFixed; fixed < limit && fixed <= fixedEnd; fixed += spacing) {
        lineFields.length = lineWakes.length = 0;
        if (fields) {
          for (const field of fields) {
            if (Math.abs(fixed - (vertical ? field.x : field.y)) < field.reach) lineFields.push(field);
          }
        }
        if (wakes) {
          for (const wake of wakes) {
            if (vertical ? fixed >= wake.left && fixed <= wake.right : fixed >= wake.top && fixed <= wake.bottom) {
              lineWakes.push(wake);
            }
          }
        }
        const warped = lineFields.length || lineWakes.length ||
          (cursor && Math.abs(fixed - (vertical ? bend.x : bend.y)) < 110);
        const alpha = vertical ? baseAlpha(fixed) : 0;
        if (!warped) {
          if (vertical) stroke(target, fixed, firstOffset, fixed, Math.min(length, lineEnd + 8), alpha);
          else {
            for (let offset = firstOffset; offset < length && offset <= lineEnd; offset += 8) {
              stroke(target, offset, fixed, Math.min(offset + 8, length), fixed, horizontalAlpha[offset / 8]);
            }
          }
          continue;
        }
        let start = firstPoint;
        let end = secondPoint;
        warpPoint(vertical ? fixed : firstOffset, vertical ? firstOffset : fixed, start);
        for (let offset = firstOffset; offset < length && offset <= lineEnd; offset += 8) {
          const next = Math.min(offset + 8, length);
          warpPoint(vertical ? fixed : next, vertical ? next : fixed, end);
          const opacity = vertical ? alpha : horizontalAlpha[offset / 8];
          stroke(target, start.x, start.y, end.x, end.y,
            opacity + start.cursorHighlight + start.bubbleHighlight + start.letterHighlight);
          const previous = start;
          start = end;
          end = previous;
        }
      }
    }
    lineFields.length = lineWakes.length = 0;
    target.globalAlpha = 1;
  }

  function restoreRegion() {
    if (!lastRegion) return;
    const { x, y, w, h } = lastRegion;
    context.clearRect(x / scale, y / scale, w / scale, h / scale);
    context.drawImage(baseContext.canvas, x, y, w, h, x / scale, y / scale, w / scale, h / scale);
    lastRegion = null;
  }

  function draw() {
    const fields = bubbleFields;
    gridHasBubbles = fields.length > 0;
    if (!fields.length && !letterWakes.length && !bend.strength) {
      restoreRegion();
      return;
    }

    let left = width, top = height, right = 0, bottom = 0;
    function include(l, t, r, b) {
      left = Math.min(left, l);
      top = Math.min(top, t);
      right = Math.max(right, r);
      bottom = Math.max(bottom, b);
    }
    for (const { x, y, reach } of fields) include(x - reach, y - reach, x + reach, y + reach);
    for (const wake of letterWakes) include(wake.left, wake.top, wake.right, wake.bottom);
    if (bend.strength) include(bend.x - 110, bend.y - 110, bend.x + 110, bend.y + 110);

    // Include the maximum displacement and the segment adjoining each end.
    const padding = 52;
    const x = Math.max(0, Math.floor((left - padding) * scale));
    const y = Math.max(0, Math.floor((top - padding) * scale));
    const w = Math.min(canvas.width, Math.ceil((right + padding) * scale)) - x;
    const h = Math.min(canvas.height, Math.ceil((bottom + padding) * scale)) - y;
    if (w <= 0 || h <= 0) {
      restoreRegion();
      return;
    }
    if (!baseContext) {
      baseContext = document.createElement("canvas").getContext("2d");
      if (!baseContext) return;
      const base = baseContext.canvas;
      base.width = canvas.width;
      base.height = canvas.height;
      baseContext.drawImage(canvas, 0, 0);
    }
    if (lastRegion && (x > lastRegion.x || y > lastRegion.y ||
        x + w < lastRegion.x + lastRegion.w || y + h < lastRegion.y + lastRegion.h)) restoreRegion();
    lastRegion = { x, y, w, h };
    context.clearRect(x / scale, y / scale, w / scale, h / scale);
    context.save();
    context.beginPath();
    context.rect(x / scale, y / scale, w / scale, h / scale);
    context.clip();
    paint(context, {
      left: x / scale - 1, top: y / scale - 1,
      right: (x + w) / scale + 1, bottom: (y + h) / scale + 1,
    }, fields, letterWakes, !!bend.strength);
    context.restore();
  }

  function updateBubbles(bubbles, scrollY) {
    liveBubbles = bubbles;
    refreshBubbleFields(scrollY);
    if (gridHasBubbles || bubbleFields.length) schedule();
  }

  function updateLetters(wakes) {
    if (wakes.length || letterWakes.length) schedule();
    letterWakes = wakes;
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    if (width === bounds.width && height === bounds.height && scale === pixelRatio) return;
    width = bounds.width;
    height = bounds.height;
    scale = pixelRatio;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    horizontalAlpha = Float64Array.from({ length: Math.ceil(width / 8) }, (_, i) => baseAlpha(i * 8));
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.strokeStyle = "#aaa";
    lastRegion = null;
    const region = { left: 0, top: 0, right: width, bottom: height };
    if (baseContext) {
      const base = baseContext.canvas;
      base.width = canvas.width;
      base.height = canvas.height;
      baseContext.setTransform(scale, 0, 0, scale, 0, 0);
      baseContext.strokeStyle = "#aaa";
      paint(baseContext, region);
      if (width && height) context.drawImage(base, 0, 0, base.width / scale, base.height / scale);
    } else {
      paint(context, region);
    }
    refreshBubbleFields(window.scrollY, bounds);
    draw();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(animate);
  }

  function animate() {
    frame = 0;
    const target = pointer.inside && !reducedMotion.matches ? 1 : 0;
    bend.x += (pointer.x - bend.x) * 0.32;
    bend.y += (pointer.y - bend.y) * 0.32;
    bend.strength += (target - bend.strength) * 0.24;
    if (Math.abs(target - bend.strength) < 0.01) bend.strength = target;
    draw();
    if (target !== bend.strength ||
      (target && Math.hypot(pointer.x - bend.x, pointer.y - bend.y) > 0.5)) schedule();
  }

  function locate(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
  }

  intro.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || reducedMotion.matches) return;
    locate(event);
    if (!bend.strength) {
      bend.x = pointer.x;
      bend.y = pointer.y;
    }
    pointer.inside = true;
    schedule();
  }, { passive: true, signal });

  function leave() {
    pointer.inside = false;
    schedule();
  }

  intro.addEventListener("pointerleave", leave, { signal });
  intro.addEventListener("pointercancel", leave, { signal });
  reducedMotion.addEventListener("change", () => {
    pointer.inside = false;
    bend.strength = 0;
    if (reducedMotion.matches) letterWakes = [];
    draw();
  }, { signal });
  const observer = new ResizeObserver(resize);
  observer.observe(intro);
  resize();
  return {
    updateBubbles,
    updateLetters,
    dispose() {
      observer.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}
