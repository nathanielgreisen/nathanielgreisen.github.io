import { makeLetterWake } from "./letter-wake.js";
import { mountPageInteractions } from "./grid-interactions.js";
import { contactImpulse, spinFromFlick, wrapAngle } from "./letter-motion.js";
import { createGlyphRotator, readGlyphMask } from "./letter-rotation.js";
import { blocks, glyphContact, glyphsOverlap } from "./letter-navigation.js";
import { sampleLetterRecovery } from "./letter-recovery.js";
import { setupBubbleRefraction } from "./bubble-refraction.js";
import { beginBubbleMerge, sampleBubbleMotion } from "./bubble-motion.js";

export function mountInteractions(container) {
  const page = mountPageInteractions(container);
  const { grid, reducedMotion, signal } = page;
  const name = container.querySelector(".home-intro #name");
  const bubbleCanvas = container.querySelector(".page-bubbles");
  const disposeLetters = name && setupNameLetters(name, reducedMotion, grid?.updateLetters, signal);
  const refraction = name && bubbleCanvas && setupBubbleRefraction(name);
  const disposeBubbles = bubbleCanvas && setupBubbles(bubbleCanvas, reducedMotion, (bubbles, scrollY) => {
    grid?.updateBubbles(bubbles, scrollY);
    refraction?.update(bubbles, scrollY);
  }, signal);

  return () => {
    page.dispose();
    disposeLetters && disposeLetters();
    disposeBubbles && disposeBubbles();
    refraction?.dispose();
  };
}

function setupNameLetters(heading, reducedMotion, updateGridLetters, signal) {
  const grid = heading.closest(".home-intro");
  const letters = Array.from(heading.querySelectorAll(".name-letter"), (element, index) => ({
    element, glyph: element.firstElementChild, index, x: 0, y: 0, vx: 0, vy: 0, angle: 0, omega: 0, motionReason: "idle",
    text: element.textContent, renderedAngle: 0,
  }));
  const maskContext = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rotationContext = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!letters.length || !maskContext || !rotationContext) return;
  const glyphs = new Set(letters.map(letter => letter.text));
  const bodies = letters.map(letter => ({ letter }));
  let maskStyle = "";
  let drag = null;
  let letterFrame = 0;
  let returnTimer = 0;
  let lastFrameTime = null;
  let returnAt = null;
  let draft = null;
  let recovery = null;
  let aligning = false;
  const maxLetterSpeed = 2400;
  const flickWindow = 60;
  const returnDelay = 2200;

  function refreshMasks() {
    const font = getComputedStyle(heading);
    const canvasFont = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
    const style = canvasFont + font.lineHeight;
    if (style === maskStyle) return;
    const probe = document.createElement("span");
    probe.style.display = "inline-block";
    const first = letters[0].element;
    first.append(probe);
    const baseline = probe.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
    probe.remove();
    const masks = measureGlyphs(maskContext, rotationContext, canvasFont, glyphs, baseline);
    for (const letter of letters) {
      const { mask, maskAt } = masks.get(letter.text);
      letter.maskAt = maskAt;
      letter.pivot = mask.pivot;
      letter.inertia = mask.inertia;
      // The farthest ink corner bounds how far any stroke can move while spinning.
      letter.spinRadius = Math.hypot(
        Math.max(mask.pivot.x - mask.ink.left, mask.ink.right - mask.pivot.x),
        Math.max(mask.pivot.y - mask.ink.top, mask.ink.bottom - mask.pivot.y)
      ) + 1;
      letter.glyph.style.transformOrigin = `${mask.pivot.x}px ${mask.pivot.y}px`;
    }
    maskStyle = style;
  }

  for (const letter of letters) {
    const { element } = letter;
    element.addEventListener("pointerdown", event => {
      if (drag || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      cancelPlan();
      if (recovery) {
        recovery = null;
        for (const moving of letters) {
          if (moving !== letter) setLetterMotion(moving, moving.vx || moving.vy ? "coasting" : "idle");
        }
      }
      const bounds = element.getBoundingClientRect();
      drag = { letter, pointerId: event.pointerId,
        offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top,
        width: bounds.width, height: bounds.height,
        left: bounds.left, top: bounds.top, samples: [], movedAt: -Infinity };
      samplePointer(event);
      letter.vx = letter.vy = letter.omega = 0;
      setLetterMotion(letter, "drag");
      scheduleLetters();
      element.setPointerCapture(event.pointerId);
      element.classList.add("is-dragging");
    }, { signal });
  }

  window.addEventListener("pointermove", event => {
    if (drag?.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      endDrag(event);
      return;
    }
    for (const sample of event.getCoalescedEvents?.() ?? []) samplePointer(sample);
    samplePointer(event);
    drag.left = event.clientX - drag.offsetX;
    drag.top = event.clientY - drag.offsetY;
    scheduleLetters();
  }, { signal });

  function samplePointer({ clientX: x, clientY: y, timeStamp: time }) {
    const { samples } = drag;
    const previous = samples.at(-1);
    if (previous && time < previous.time) return;
    if (previous && (previous.x !== x || previous.y !== y)) drag.movedAt = time;
    if (!previous || previous.time !== time || previous.x !== x || previous.y !== y) {
      samples.push({ x, y, time });
    }
    // Keep one sample before the window so a single fast move still has a starting point.
    while (samples.length > 2 && samples[1].time < time - flickWindow) samples.shift();
  }

  function endDrag(releaseEvent) {
    if (!drag) return;
    const { letter, samples } = drag;
    letter.vx = letter.vy = 0;
    if (releaseEvent) {
      samplePointer(releaseEvent);
      const last = samples.at(-1);
      if (last.time - drag.movedAt < flickWindow) {
        const first = samples[0];
        const previous = samples.findLast(sample => sample.x !== last.x || sample.y !== last.y);
        // Use the latest direction if the pointer doubled back during the sample window.
        const forward = (last.x - first.x) * (last.x - previous.x) +
          (last.y - first.y) * (last.y - previous.y);
        const start = forward > 0 ? first : previous;
        const dx = last.x - start.x;
        const dy = last.y - start.y;
        const elapsed = Math.min(flickWindow, Math.max(1, last.time - start.time)) / 1000;
        const travelTime = Math.max(elapsed, Math.hypot(dx, dy) / maxLetterSpeed);
        letter.vx = dx / travelTime;
        letter.vy = dy / travelTime;
        const { width, height, offsetX, offsetY } = drag;
        letter.omega = spinFromFlick(letter.vx, letter.vy, offsetX, offsetY,
          letter.pivot ?? { x: width / 2, y: height / 2 },
          letter.inertia ?? (width ** 2 + height ** 2) / 12);
      }
    }
    setLetterMotion(letter, letter.vx || letter.vy ? "flick" : "idle");
    letter.element.classList.remove("is-dragging");
    drag = null;
    scheduleLetters();
  }

  for (const type of ["pointerup", "pointercancel"]) {
    window.addEventListener(type, event => {
      if (drag?.pointerId === event.pointerId) endDrag(type === "pointerup" ? event : undefined);
    }, { signal });
  }
  window.addEventListener("blur", () => endDrag(), { signal });

  function scheduleLetters() {
    clearTimeout(returnTimer);
    if (!letterFrame) letterFrame = requestAnimationFrame(animateLetters);
  }

  function cancelPlan() {
    draft?.worker.terminate();
    draft = null;
    returnAt = null;
    aligning = false;
    for (const letter of letters) {
      letter.uprightWait = 0;
      letter.uprightTarget = null;
    }
    delete heading.dataset.returnPlan;
  }

  function planReturn(bodies, bounds) {
    const worker = new Worker(new URL("./letter-planner-worker.js", import.meta.url), { type: "module" });
    const request = { worker, trip: null };
    draft = request;
    heading.dataset.returnPlan = "planning";
    function complete(trip) {
      worker.terminate();
      if (draft !== request) return;
      request.trip = trip;
      heading.dataset.returnPlan = trip ? "ready" : "blocked";
      if (trip && performance.now() >= returnAt) scheduleLetters();
    }
    worker.addEventListener("message", ({ data }) => complete(data), { once: true });
    worker.addEventListener("error", () => complete(null), { once: true });
    worker.postMessage({
      bounds: { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom },
      bodies: bodies.map(({ letter, bounds, mask, x, y }) => ({
        x, y,
        letter: { x: letter.x, y: letter.y },
        bounds: { left: x, top: y, width: bounds.width, height: bounds.height },
        mask: { left: mask.left, top: mask.top, width: mask.width, height: mask.height, rows: mask.rows },
      })),
    });
  }

  function regroup(bodies, bounds, time) {
    if (!recovery) {
      const trip = draft.trip;
      const duration = Math.min(5000, Math.max(800, trip.total * 7));
      recovery = { started: time, lastFrame: time, trip, duration };
      cancelPlan();
      updateGridLetters?.([]);
    }
    const progress = Math.min(1, (time - recovery.started) / recovery.duration);
    const pose = sampleLetterRecovery(recovery.trip, progress);
    const dt = (time - recovery.lastFrame) / 1000;
    recovery.lastFrame = time;

    for (const [i, body] of bodies.entries()) {
      const { letter } = body;
      if (progress === 1) {
        letter.x = letter.y = letter.vx = letter.vy = 0;
        letter.element.style.removeProperty("transform");
        setLetterMotion(letter, "idle");
        continue;
      }
      const dx = pose[i * 2] - letter.x;
      const dy = pose[i * 2 + 1] - letter.y;
      letter.vx = dt > 0 ? dx / dt : 0;
      letter.vy = dt > 0 ? dy / dt : 0;
      if (!dx && !dy) continue;
      placeLetter(letter, body.x + dx, body.y + dy, bounds, body.bounds);
      setLetterMotion(letter, "regroup");
    }

    if (progress < 1) {
      scheduleLetters();
    } else {
      recovery = null;
      lastFrameTime = null;
    }
  }

  function animateLetters(time) {
    letterFrame = 0;
    const dt = lastFrameTime === null ? 1 / 60 : Math.min((time - lastFrameTime) / 1000, 1 / 30);
    lastFrameTime = time;
    if (dt <= 0) {
      scheduleLetters();
      return;
    }
    const gridBounds = grid.getBoundingClientRect();
    if (!maskStyle) refreshMasks();

    for (const body of bodies) {
      const { letter } = body;
      const bounds = letter.element.getBoundingClientRect();
      const { maskAt, pivot, inertia } = letter;
      body.bounds = bounds;
      body.mask = maskAt(letter.angle);
      body.maskAt = maskAt;
      body.pivot = pivot;
      body.inertia = inertia;
      body.x = bounds.left;
      body.y = bounds.top;
      body.uprighting = false;
    }
    if (recovery || (!drag && draft?.trip && time >= returnAt)) {
      regroup(bodies, gridBounds, time);
      return;
    }
    const grabbed = drag && bodies[drag.letter.index];
    if (grabbed) {
      const targetX = Math.max(gridBounds.left, Math.min(drag.left, gridBounds.right - grabbed.bounds.width));
      const targetY = Math.max(gridBounds.top, Math.min(drag.top, gridBounds.bottom - grabbed.bounds.height));
      const dx = targetX - grabbed.x;
      const dy = targetY - grabbed.y;
      const distance = Math.hypot(dx, dy);
      const followTime = distance < 0.25 ? dt : dt / -Math.expm1(-dt * 24);
      const travelTime = Math.max(followTime, distance / maxLetterSpeed);
      grabbed.letter.vx = dx / travelTime;
      grabbed.letter.vy = dy / travelTime;
    }

    if (!drag && !aligning && returnAt !== null && time >= returnAt) {
      const turns = letters.filter(letter => letter.angle)
        .map(letter => ({ letter, order: Math.random() }))
        .sort((first, second) => first.order - second.order);
      aligning = turns.length > 0;
      let straightenAt = time;
      for (const { letter } of turns) {
        letter.straightenAt = straightenAt;
        straightenAt += 20 + Math.random() * 14;
      }
    }
    // Stagger only the start of each turn, so the letters can straighten together.
    for (const body of bodies) {
      const { letter } = body;
      if (!aligning || !letter.angle || time < letter.straightenAt) continue;
      body.uprighting = true;
      if (makeRoomToStraighten(body, bodies, gridBounds, dt)) continue;
      const acceleration = 20;
      const remaining = Math.abs(letter.angle);
      const speed = Math.min(3.2, Math.sqrt(2 * acceleration * remaining), remaining / dt);
      const target = -Math.sign(letter.angle) * speed;
      const change = acceleration * dt;
      letter.omega += Math.max(-change, Math.min(change, target - letter.omega));
    }
    stepLetterPhysics(bodies, gridBounds, dt);

    const wakes = [];
    for (const body of bodies) {
      const { letter } = body;
      if (body.x !== body.bounds.left || body.y !== body.bounds.top) {
        placeLetter(letter, body.x, body.y, gridBounds, body.bounds);
        if (updateGridLetters && !reducedMotion.matches) {
          const wake = makeLetterWake(body, gridBounds, dt);
          if (wake) wakes.push(wake);
        }
      }
      if (letter.angle !== letter.renderedAngle) {
        if (letter.angle) letter.glyph.style.rotate = `${letter.angle}rad`;
        else letter.glyph.style.removeProperty("rotate");
        letter.renderedAngle = letter.angle;
      }
      if (body === grabbed) continue;
      if (!body.uprighting) {
        const spin = Math.abs(letter.omega);
        letter.omega = Math.sign(letter.omega) * Math.max(0, spin - (0.95 + spin * 1.45) * dt);
      }
      const speed = Math.hypot(letter.vx, letter.vy);
      if (speed) {
        const remaining = Math.max(0, speed - (245 + speed * 0.25) * dt) / speed;
        letter.vx *= remaining;
        letter.vy *= remaining;
      }
      if (!letter.vx && !letter.vy && !letter.omega) setLetterMotion(letter, "idle");
    }

    const tilted = letters.some(letter => letter.angle);
    if (drag || letters.some(letter => letter.vx || letter.vy || letter.omega) || (aligning && tilted)) {
      if (!aligning) returnAt = null;
      updateGridLetters?.(wakes);
      scheduleLetters();
    } else {
      updateGridLetters?.([]);
      lastFrameTime = null;
      aligning = false;
      if (tilted || letters.some(letter => letter.x || letter.y)) {
        returnAt ??= time + returnDelay;
        if (!tilted && !draft) planReturn(bodies, gridBounds);
        if (time < returnAt) {
          returnTimer = setTimeout(scheduleLetters, Math.max(0, returnAt - performance.now()));
        }
      } else {
        cancelPlan();
      }
    }
  }

  function placeLetter(letter, left, top, gridBounds, bounds = letter.element.getBoundingClientRect()) {
    const x = Math.max(gridBounds.left, Math.min(left, gridBounds.right - bounds.width));
    const y = Math.max(gridBounds.top, Math.min(top, gridBounds.bottom - bounds.height));
    if (x === bounds.left && y === bounds.top) return;
    letter.x += x - bounds.left;
    letter.y += y - bounds.top;
    letter.element.style.transform = `translate(${letter.x}px, ${letter.y}px)`;
  }

  const observer = new ResizeObserver(() => {
    refreshMasks();
    if (recovery || draft || aligning) {
      recovery = null;
      cancelPlan();
      for (const letter of letters) {
        letter.vx = letter.vy = 0;
        setLetterMotion(letter, "idle");
      }
      scheduleLetters();
    }
    const gridBounds = grid.getBoundingClientRect();
    const shifted = [];
    for (const letter of letters) {
      if (letter.x || letter.y) shifted.push([letter, letter.element.getBoundingClientRect()]);
    }
    for (const [letter, bounds] of shifted) {
      placeLetter(letter, bounds.left, bounds.top, gridBounds, bounds);
    }
  });
  observer.observe(grid);
  observer.observe(heading);
  return () => {
    observer.disconnect();
    cancelPlan();
    cancelAnimationFrame(letterFrame);
    clearTimeout(returnTimer);
    if (drag) drag.letter.element.classList.remove("is-dragging");
  };
}

function measureGlyphs(context, rotationContext, font, glyphs, baseline) {
  context.font = font;
  let sheetWidth = 0;
  const entries = Array.from(glyphs, glyph => {
    const metrics = context.measureText(glyph);
    const left = Math.floor(-metrics.actualBoundingBoxLeft) - 1;
    const top = Math.floor(-metrics.actualBoundingBoxAscent) - 1;
    const width = Math.ceil(metrics.actualBoundingBoxRight) - left + 1;
    const height = Math.ceil(metrics.actualBoundingBoxDescent) - top + 1;
    const x = sheetWidth;
    sheetWidth += width;
    return { glyph, x, left, top, width, height };
  });
  const sheetHeight = Math.max(...entries.map(entry => entry.height));
  context.canvas.width = sheetWidth;
  context.canvas.height = sheetHeight;
  context.font = font;
  for (const { glyph, x, left, top } of entries) context.fillText(glyph, x - left, -top);
  const sheet = context.getImageData(0, 0, sheetWidth, sheetHeight).data;
  return new Map(entries.map(({ glyph, x, left, top, width, height }) => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      const start = (y * sheetWidth + x) * 4;
      pixels.set(sheet.subarray(start, start + width * 4), y * width * 4);
    }
    const mask = readGlyphMask(pixels, width, height, left, top + baseline);
    return [glyph, { mask, maskAt: createGlyphRotator(mask, pixels, rotationContext) }];
  }));
}

function setLetterMotion(letter, reason) {
  if (letter.motionReason === reason) return;
  letter.motionReason = reason;
  letter.element.dataset.motionReason = reason;
  if (import.meta.env?.DEV) console.debug(`[letters] ${letter.text} #${letter.index + 1}: ${reason}`);
}

export function stepLetterPhysics(bodies, bounds, dt, random = Math.random) {
  let fastest = 0;
  for (const { letter, bounds } of bodies) {
    const spin = Math.min(12, Math.abs(letter.omega ?? 0));
    const radius = letter.spinRadius ?? Math.max(bounds.width, bounds.height);
    fastest = Math.max(fastest, Math.hypot(letter.vx, letter.vy) + spin * radius);
  }
  if (!fastest) return;
  // Subdivide motion so thin glyph strokes can't pass through each other.
  const steps = Math.max(1, Math.ceil(fastest * dt * 2));
  const step = dt / steps;
  for (let i = 0; i < steps; i++) {
    for (const body of bodies) {
      moveLetterAxis(body, bodies, step, "x", "vx", bounds, random);
      moveLetterAxis(body, bodies, step, "y", "vy", bounds, random);
      rotateLetter(body, bodies, step, bounds);
    }
  }
}

function axisLimits(body, bounds, axis, rotated = Boolean(body.letter.angle)) {
  const horizontal = axis === "x";
  const edge = horizontal ? "left" : "top";
  const opposite = horizontal ? "right" : "bottom";
  const span = horizontal ? "width" : "height";
  const min = bounds[edge];
  const max = bounds[opposite] - body.bounds[span];
  if (!rotated) return [min, max];
  const { ink } = body.mask;
  return [Math.max(min, min - (ink?.[edge] ?? body.mask[edge] + 1)),
    Math.min(max, bounds[opposite] - (ink?.[opposite] ?? body.mask[edge] + body.mask[span] - 1))];
}

function fitsAt(body, bounds, rotated) {
  const [left, right] = axisLimits(body, bounds, "x", rotated);
  if (!(body.x >= left - 0.01 && body.x <= right + 0.01)) return false;
  const [top, bottom] = axisLimits(body, bounds, "y", rotated);
  return body.y >= top - 0.01 && body.y <= bottom + 0.01;
}

function makeRoomToStraighten(body, bodies, bounds, dt) {
  const { letter } = body;
  if (!letter.uprightTarget && !(letter.uprightWait >= 0.12)) return false;
  const canSlide = (moving, point) =>
    fitsAt({ ...moving, ...point }, bounds, Boolean(moving.letter.angle)) &&
    !bodies.some(other => other !== moving && blocks(moving, moving, point, other, glyphsOverlap));

  if (!letter.uprightTarget) {
    const others = bodies.filter(other => other !== body);
    const steps = Math.ceil(Math.abs(letter.angle) * 90 / Math.PI);
    const poses = Array.from({ length: steps + 1 }, (_, i) => {
      const angle = letter.angle * (1 - i / steps);
      return { ...body, mask: body.maskAt(angle), angle };
    });
    function findClearance(moving, clearsTurn) {
      for (const distance of [3, 7, 14, 24, 40, 64, 96]) {
        for (let direction = 0; direction < 16; direction++) {
          const angle = direction * Math.PI / 8;
          const point = { x: moving.x + Math.cos(angle) * distance, y: moving.y + Math.sin(angle) * distance };
          if (clearsTurn(point) && canSlide(moving, point)) {
            return { index: moving.letter.index, x: point.x - bounds.left, y: point.y - bounds.top };
          }
        }
      }
      return null;
    }
    const clearsTurn = (point, turn) => turn.every(pose => {
      const shifted = { ...pose, ...point };
      return fitsAt(shifted, bounds, Boolean(pose.angle)) && !others.some(other => glyphsOverlap(shifted, other));
    });
    const nextTurn = poses.slice(0, 12);
    letter.uprightTarget = findClearance(body, point => clearsTurn(point, poses));
    if (!letter.uprightTarget && nextTurn.length < poses.length) {
      letter.uprightTarget = findClearance(body, point => clearsTurn(point, nextTurn));
    }
    // When the tilted glyph is boxed in, let a blocker yield before trying the turn again.
    if (!letter.uprightTarget) {
      for (const blocker of others) {
        if (blocker.letter.uprightTarget || !nextTurn.some(pose => glyphsOverlap(pose, blocker))) continue;
        letter.uprightTarget = findClearance(blocker, point =>
          nextTurn.every(pose => !glyphsOverlap(pose, { ...blocker, ...point })));
        if (letter.uprightTarget) break;
      }
    }

    letter.uprightWait = 0;
    if (!letter.uprightTarget) return false;
  }

  const moving = bodies[letter.uprightTarget.index];
  const dx = bounds.left + letter.uprightTarget.x - moving.x;
  const dy = bounds.top + letter.uprightTarget.y - moving.y;
  const distance = Math.hypot(dx, dy);
  const fraction = distance ? Math.min(1, 130 * dt / distance) : 1;
  const next = { x: moving.x + dx * fraction, y: moving.y + dy * fraction };
  if (!canSlide(moving, next)) {
    letter.uprightTarget = null;
    return false;
  }
  Object.assign(moving, next);
  letter.omega = 0;
  if (fraction === 1) letter.uprightTarget = null;
  return true;
}

function rotateLetter(body, others, dt, bounds) {
  const { letter, maskAt } = body;
  if (!maskAt || !letter.omega) return;
  const omega = Math.max(-12, Math.min(12, letter.omega));
  let next = wrapAngle(letter.angle + omega * dt);
  if (body.uprighting && (Math.abs(next) < 0.006 || next * letter.angle < 0)) next = 0;
  const before = body.mask;
  const target = maskAt(next);
  body.mask = target;
  if (target !== before && !fitsRotatedBody(body, others, bounds, next)) {
    body.mask = before;
    if (body.uprighting) {
      const x = body.x;
      const y = body.y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
        [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
        body.x = x + dx;
        body.y = y + dy;
        if (!fitsAt(body, bounds, true) || others.some(other => body !== other &&
          blocks(body, { x, y }, body, other, glyphsOverlap))) continue;
        body.mask = target;
        if (fitsRotatedBody(body, others, bounds, next)) {
          letter.angle = next;
          if (target !== before || !next) letter.uprightWait = 0;
          if (!next) letter.omega = 0;
          return;
        }
        body.mask = before;
      }
      body.x = x;
      body.y = y;
      letter.omega = 0;
      letter.uprightWait = (letter.uprightWait ?? 0) + dt;
    } else {
      letter.omega = -omega * 0.28;
    }
    return;
  }
  letter.angle = next;
  if (target !== before || !next) letter.uprightWait = 0;
  letter.omega = next || !body.uprighting ? omega : 0;
}

function fitsRotatedBody(body, others, bounds, angle) {
  if (!fitsAt(body, bounds, Boolean(angle))) return false;
  for (const other of others) {
    if (body !== other && glyphsOverlap(body, other)) return false;
  }
  return true;
}

function moveLetterAxis(body, bodies, dt, axis, velocity, bounds, random) {
  const { letter } = body;
  const speed = letter[velocity];
  if (!speed) return;
  const [min, max] = axisLimits(body, bounds, axis);
  if (min > max) return;
  const previous = body[axis];
  const next = previous + speed * dt;
  const proposed = Math.max(min, Math.min(max, next));
  body[axis] = proposed;
  if (body[axis] === previous) {
    if (next < min || next > max) letter[velocity] *= -0.35;
    return;
  }

  for (const other of bodies) {
    if (other === body || !glyphsOverlap(body, other)) continue;
    body[axis] = previous;
    const alreadyOverlapping = glyphsOverlap(body, other);
    body[axis] = proposed;
    if (alreadyOverlapping) continue;
    const contact = glyphContact(body, other);
    body[axis] = previous;
    if (contact && contactImpulse(body, other, contact, axis, Math.sign(speed), random)) {
      body.uprighting = other.uprighting = false;
      const hit = other.letter;
      if (hit.motionReason !== "drag" && hit.motionReason !== "flick") {
        setLetterMotion(hit, "user-impact");
      }
    }
    return;
  }
  if (next < min || next > max) letter[velocity] *= -0.35;
}

function setupBubbles(canvas, reducedMotion, updateEffects, signal) {
  const context = canvas.getContext("2d");
  if (!context) return;
  let width = 0;
  let height = 0;
  let scale = 1;
  let frame = 0;
  let heldBubble = null;
  const floatingBubbles = [];
  const positions = [];
  const centers = [];
  const pops = [];
  let nextDrift = 0;
  let nextBubbleId = 0;
  let ambientTimer = 0;
  const maxAmbientRadius = 12;
  const maxAmbientMergeRadius = 13;
  let contacts = new Map();
  let currentContacts = new Map();
  const consumed = new Set();
  const merged = [];
  const driftRates = [5, -17, 19, -5, 12, -12];
  let viewportTop = 0;
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;

  function radiusAt(time) {
    const heldSeconds = Math.max(0, time - heldBubble.started) / 1000;
    const limit = Math.min(width, document.documentElement.clientHeight) * 0.22;
    return Math.min(limit, 8 + 34 * heldSeconds);
  }

  function drawBubble(x, y, radius, opacity = 1) {
    includePixels(x, y, radius);
    context.globalAlpha = 0.35 * opacity;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 0.48 * opacity;
    context.beginPath();
    context.arc(x, y, radius * 0.78, Math.PI * 1.08, Math.PI * 1.4);
    context.stroke();
  }

  function includePixels(x, y, radius) {
    left = Math.min(left, x - radius);
    top = Math.min(top, y - viewportTop - radius);
    right = Math.max(right, x + radius);
    bottom = Math.max(bottom, y - viewportTop + radius);
  }

  function makePop(x, y, radius, time) {
    const angleOffset = Math.random() * Math.PI * 2;
    const particles = Array.from({ length: 9 }, (_, index) => {
      const angle = angleOffset + (index + (Math.random() - 0.5) * 1.3) * Math.PI * 2 / 9;
      return {
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        startDistance: radius * (0.75 + Math.random() * 0.28),
        travel: (12 + radius * 0.35) * (0.65 + Math.random() * 0.6),
        downwardCurve: Math.random() < 0.35 ? 2 + Math.random() * 4 : 0
      };
    });
    return { x, y, started: time, particles };
  }

  function sampleDelay(min, peak, max) {
    const sample = Math.random();
    // Inverse CDF of a triangular distribution, in milliseconds.
    return sample < (peak - min) / (max - min)
      ? min + Math.sqrt(sample * (max - min) * (peak - min))
      : max - Math.sqrt((1 - sample) * (max - min) * (max - peak));
  }

  function mergeOverlaps(time) {
    for (let i = 0; i < positions.length; i++) {
      const a = positions[i];
      if (a.tail || consumed.has(a.id)) continue;
      for (let j = i + 1; j < positions.length; j++) {
        const b = positions[j];
        if (b.tail || consumed.has(b.id)) continue;
        const dx = a.x - b.x;
        const reach = a.radius + b.radius;
        if (Math.abs(dx) > reach) continue;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        if (a.ambient && b.ambient && Math.hypot(a.radius, b.radius) > maxAmbientMergeRadius) continue;

        const key = a.id + ":" + b.id;
        const deadline = contacts.get(key) ?? time + sampleDelay(500, 1000, 5000);
        if (time < deadline) {
          currentContacts.set(key, deadline);
          continue;
        }

        consumed.add(a.id);
        consumed.add(b.id);
        merged.push({ id: nextBubbleId++, ...beginBubbleMerge(a, b, time) });
        break;
      }
    }

    const previousContacts = contacts;
    contacts = currentContacts;
    currentContacts = previousContacts;
    currentContacts.clear();
    if (!merged.length) return;

    let kept = 0;
    for (const bubble of floatingBubbles) {
      if (!consumed.has(bubble.id)) floatingBubbles[kept++] = bubble;
    }
    floatingBubbles.length = kept;
    kept = 0;
    for (const bubble of positions) {
      if (!consumed.has(bubble.id)) positions[kept++] = bubble;
    }
    positions.length = kept;
    for (const bubble of merged) {
      floatingBubbles.push(bubble);
      positions.push(sampleBubbleMotion(bubble, time));
    }
    consumed.clear();
    merged.length = 0;
  }

  function drawBubbles(time) {
    const scroll = window.scrollY;
    if (scroll !== viewportTop) {
      viewportTop = scroll;
      context.setTransform(scale, 0, 0, scale, 0, -viewportTop * scale);
    }
    if (left !== Infinity) {
      // Clear the previous strokes in device pixels, including their antialiasing.
      const x = Math.max(0, Math.floor(left * scale) - 2);
      const y = Math.max(0, Math.floor(top * scale) - 2);
      const w = Math.min(canvas.width, Math.ceil(right * scale) + 2) - x;
      const h = Math.min(canvas.height, Math.ceil(bottom * scale) + 2) - y;
      if (w > 0 && h > 0) {
        context.clearRect(x / scale, viewportTop + y / scale, w / scale, h / scale);
      }
    }
    left = top = Infinity;
    right = bottom = -Infinity;
    const viewportBottom = viewportTop + height;
    centers.length = 0;
    if (heldBubble) {
      const radius = radiusAt(time);
      const y = heldBubble.y + viewportTop;
      centers.push({ x: heldBubble.x, y, radius });
      drawBubble(heldBubble.x, y, radius);
    }

    positions.length = 0;
    let kept = 0;
    for (const bubble of floatingBubbles) {
      const sample = sampleBubbleMotion(bubble, time);
      const { x, y, radius: r } = sample;
      if (bubble.merging && !sample.tail) bubble.merging = null;
      if (y - r <= viewportTop || x - r <= 0 || x + r >= width) {
        pops.push(makePop(x, Math.max(viewportTop + r, y), r, time));
        continue;
      }
      floatingBubbles[kept++] = bubble;
      sample.id = bubble.id;
      sample.drift = bubble.drift;
      sample.ambient = bubble.ambient;
      sample.age = Math.max(0, time - bubble.released) / 1000;
      positions.push(sample);
    }
    floatingBubbles.length = kept;

    mergeOverlaps(time);
    for (const bubble of positions) {
      centers.push(bubble);
      if (bubble.y - bubble.radius < viewportBottom) drawBubble(bubble.x, bubble.y, bubble.radius);
      if (bubble.tail) {
        const { x, y, radius, opacity } = bubble.tail;
        centers.push(bubble.tail);
        if (y - radius < viewportBottom) drawBubble(x, y, radius, opacity);
      }
    }

    kept = 0;
    for (const pop of pops) {
      const progress = Math.max(0, time - pop.started) / 360;
      if (progress >= 1) continue;
      pops[kept++] = pop;
      context.globalAlpha = 0.5 * (1 - progress);
      context.beginPath();
      const dropProgress = progress ** 2;
      for (const particle of pop.particles) {
        const distance = particle.startDistance + progress * particle.travel;
        const drop = particle.downwardCurve * dropProgress;
        const x = pop.x + particle.dx * distance;
        const y = pop.y + particle.dy * distance + drop;
        if (y + 1.15 < viewportTop || y - 1.15 > viewportBottom) continue;
        includePixels(x, y, 1.15);
        context.moveTo(x + 1.15, y);
        context.arc(x, y, 1.15, 0, Math.PI * 2);
      }
      context.fill();
    }
    pops.length = kept;
    context.globalAlpha = 1;
    updateEffects(centers, viewportTop);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    if (width === bounds.width && height === bounds.height && scale === pixelRatio) return;
    scale = pixelRatio;
    width = bounds.width;
    height = bounds.height;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    viewportTop = window.scrollY;
    context.setTransform(scale, 0, 0, scale, 0, -viewportTop * scale);
    left = Infinity;
    context.strokeStyle = "#aaa";
    context.fillStyle = "#aaa";
    schedule();
  }

  function animate(time) {
    frame = 0;
    drawBubbles(time);
    if (heldBubble || floatingBubbles.length || pops.length) schedule();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(animate);
  }

  function scheduleAmbientBubble() {
    clearTimeout(ambientTimer);
    if (reducedMotion.matches || document.hidden) return;
    ambientTimer = setTimeout(() => {
      const height = document.documentElement.clientHeight;
      if (width > 32 && height > 32 && floatingBubbles.length < 48) {
        const maxRadius = Math.min(maxAmbientRadius, width * 0.2, height * 0.2);
        const radius = 4.5 + (maxRadius - 4.5) * Math.random() ** 12;
        const inset = radius + 12;
        floatingBubbles.push({
          id: nextBubbleId++,
          x: inset + Math.random() * (width - 2 * inset),
          y: window.scrollY + height + radius + 3,
          radius,
          released: performance.now(),
          drift: (Math.random() - 0.5) * 12,
          ambient: true,
          riseSpeed: 36 + Math.random() * 10
        });
        schedule();
      }
      scheduleAmbientBubble();
    }, sampleDelay(500, 2000, 5000));
  }

  function cancelHold() {
    heldBubble = null;
    document.body.classList.remove("forming-bubble");
    schedule();
  }

  function releaseBubble() {
    if (!heldBubble) return;
    const time = performance.now();
    if (floatingBubbles.length >= 48) floatingBubbles.shift();
    floatingBubbles.push({
      id: nextBubbleId++,
      x: heldBubble.x,
      y: heldBubble.y + window.scrollY,
      radius: radiusAt(time),
      released: time,
      drift: driftRates[nextDrift]
    });
    nextDrift = (nextDrift + 1) % driftRates.length;
    cancelHold();
  }

  window.addEventListener("webkitmouseforcewillbegin", event => {
    // Keep Safari's Force Click action from interrupting a bubble hold.
    if (reducedMotion.matches || !(event.target instanceof Element) ||
        event.target.closest("a, button, summary, input, textarea, select, [contenteditable]")) return;
    event.preventDefault();
  }, { signal });

  window.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.pointerType !== "mouse" || event.button !== 0 ||
        reducedMotion.matches || event.target instanceof Element &&
        event.target.closest(".name-letter")) return;
    heldBubble = {
      x: event.clientX,
      y: event.clientY,
      started: performance.now(),
      pointerId: event.pointerId
    };
    document.body.classList.add("forming-bubble");
    schedule();
  }, { passive: true, signal });

  window.addEventListener("pointermove", event => {
    if (heldBubble?.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      releaseBubble();
      return;
    }
    heldBubble.x = event.clientX;
    heldBubble.y = event.clientY;
  }, { passive: true, signal });

  window.addEventListener("pointerup", event => {
    if (heldBubble?.pointerId !== event.pointerId || event.button !== 0) return;
    heldBubble.x = event.clientX;
    heldBubble.y = event.clientY;
    releaseBubble();
  }, { passive: true, signal });

  window.addEventListener("pointercancel", event => {
    if (heldBubble?.pointerId === event.pointerId) releaseBubble();
  }, { signal });
  window.addEventListener("blur", releaseBubble, { signal });
  reducedMotion.addEventListener("change", () => {
    floatingBubbles.length = 0;
    contacts.clear();
    pops.length = 0;
    cancelHold();
    scheduleAmbientBubble();
  }, { signal });
  document.addEventListener("visibilitychange", scheduleAmbientBubble, { signal });
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  scheduleAmbientBubble();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    clearTimeout(ambientTimer);
    document.body.classList.remove("forming-bubble");
  };
}
