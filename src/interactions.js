import { makeLetterWake, sampleLetterWake } from "./letter-wake.js";
import { contactImpulse, spinFromFlick, wrapAngle } from "./letter-motion.js";
import { createGlyphRotator, readGlyphMask } from "./letter-rotation.js";
import { glyphContact, glyphsOverlap } from "./letter-navigation.js";
import { prepareLetterPlayback, sampleLetterRecovery } from "./letter-recovery.js";

export function mountInteractions(container) {
  const controller = new AbortController();
  const { signal } = controller;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const grid = setupGrid(container.querySelector(".intro-grid"), reducedMotion, signal);
  const name = container.querySelector(".home-intro #name");
  const bubbleCanvas = container.querySelector(".page-bubbles");
  const disposeLetters = name && setupNameLetters(name, reducedMotion, grid?.updateLetters, signal);
  const disposeBubbles = bubbleCanvas && setupBubbles(bubbleCanvas, reducedMotion, grid?.updateBubbles ?? (() => {}), signal);

  for (const row of container.querySelectorAll(".project-list summary")) {
    row.addEventListener("pointermove", event => {
      if (event.pointerType === "touch") return;
      const bounds = row.getBoundingClientRect();
      row.style.setProperty("--pointer-x", (event.clientX - bounds.left) + "px");
    }, { passive: true, signal });
  }

  return () => {
    controller.abort();
    grid?.dispose();
    disposeLetters && disposeLetters();
    disposeBubbles && disposeBubbles();
  };
}

function setupGrid(canvas, reducedMotion, signal) {
  const intro = canvas.parentElement;
  const context = canvas.getContext("2d");
  if (!context) return;
  const pointer = { x: 0, y: 0, inside: false };
  const bend = { x: 0, y: 0, strength: 0 };
  let width = 0;
  let height = 0;
  let frame = 0;

  let liveBubbles = [];
  let gridHasBubbles = false;
  let letterWakes = [];

  function localFields() {
    if (!liveBubbles.length) return [];
    const bounds = canvas.getBoundingClientRect();
    const pageTop = bounds.top + window.scrollY;
    return liveBubbles.flatMap(bubble => {
      const reach = bubble.radius * 2.3;
      const x = bubble.x - bounds.left;
      const y = bubble.y - pageTop;
      if (x + reach < 0 || x - reach > width || y + reach < 0 || y - reach > height) return [];
      return [{ x, y, reach }];
    });
  }

  function warpPoint(x, y, fields, wakes) {
    const dx = x - bend.x;
    const dy = y - bend.y;
    const cursorForce = Math.max(0, 1 - Math.hypot(dx, dy) / 110) ** 2 * bend.strength;
    let shiftX = dx * cursorForce;
    let shiftY = dy * cursorForce;
    let bubbleHighlight = 0;
    let letterHighlight = 0;

    for (const field of fields) {
      const bx = x - field.x;
      const by = y - field.y;
      if (Math.abs(bx) >= field.reach || Math.abs(by) >= field.reach) continue;
      const falloff = Math.max(0, 1 - Math.hypot(bx, by) / field.reach);
      const force = falloff ** 2 * 1.5;
      shiftX += bx * force;
      shiftY += by * force;
      bubbleHighlight = Math.max(bubbleHighlight, force);
    }

    for (const wake of wakes) {
      const sample = sampleLetterWake(x, y, wake);
      if (!sample) continue;
      shiftX += sample.shiftX;
      shiftY += sample.shiftY;
      letterHighlight = Math.max(letterHighlight, sample.force);
    }

    const shift = Math.hypot(shiftX, shiftY);
    const scale = shift > 42 ? 42 / shift : 1;
    return { x: x + shiftX * scale, y: y + shiftY * scale, cursorForce, bubbleHighlight, letterHighlight };
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    const fields = localFields();
    gridHasBubbles = fields.length > 0;
    const spacing = 24;
    for (const vertical of [false, true]) {
      const limit = vertical ? width : height;
      const length = vertical ? height : width;
      for (let fixed = 0.5; fixed < limit; fixed += spacing) {
        const lineFields = fields.filter(field =>
          Math.abs(fixed - (vertical ? field.x : field.y)) < field.reach);
        const lineWakes = letterWakes.filter(wake =>
          vertical ? fixed >= wake.left && fixed <= wake.right : fixed >= wake.top && fixed <= wake.bottom);
        const pointAt = offset => warpPoint(vertical ? fixed : offset,
          vertical ? offset : fixed, lineFields, lineWakes);
        let start = pointAt(0);
        for (let offset = 0; offset < length; offset += 8) {
          const end = pointAt(Math.min(offset + 8, length));
          const x = vertical ? fixed : offset;
          const xWeight = Math.max(0, (x - width * 0.2) / Math.max(1, width * 0.8));
          context.globalAlpha = 0.025 + 0.11 * xWeight +
            0.33 * start.cursorForce + 0.24 * start.bubbleHighlight + 0.32 * start.letterHighlight;
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
          start = end;
        }
      }
    }
    context.globalAlpha = 1;
  }

  function updateBubbles(bubbles) {
    liveBubbles = bubbles;
    if (gridHasBubbles || localFields().length) schedule();
  }

  function updateLetters(wakes) {
    if (wakes.length || letterWakes.length) schedule();
    letterWakes = wakes;
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.strokeStyle = "#aaa";
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

function setupNameLetters(heading, reducedMotion, updateGridLetters, signal) {
  const grid = heading.closest(".home-intro");
  const letters = Array.from(heading.querySelectorAll(".name-letter"), (element, index) => ({
    element, glyph: element.firstElementChild, index, x: 0, y: 0, vx: 0, vy: 0, angle: 0, omega: 0, motionReason: "idle",
  }));
  const maskContext = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const spinContext = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const masks = new Map();
  let maskStyle = "";
  let baseline = 0;
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
  const returnDelay = 3000;

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
    delete heading.dataset.returnPlan;
  }

  function planReturn(bodies, bounds) {
    const worker = new Worker(new URL("./letter-planner-worker.js", import.meta.url), { type: "module" });
    const request = { worker, route: null };
    draft = request;
    heading.dataset.returnPlan = "planning";
    function complete(route) {
      worker.terminate();
      if (draft !== request) return;
      request.route = route;
      heading.dataset.returnPlan = route ? "ready" : "blocked";
      if (route && performance.now() >= returnAt) scheduleLetters();
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
      const trip = prepareLetterPlayback(draft.route);
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
    const font = getComputedStyle(heading);
    const canvasFont = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
    const style = canvasFont + font.lineHeight;
    if (style !== maskStyle) {
      masks.clear();
      const probe = document.createElement("span");
      probe.style.display = "inline-block";
      const first = letters[0].element;
      first.append(probe);
      baseline = probe.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
      probe.remove();
      maskStyle = style;
    }

    const bodies = letters.map(letter => {
      const bounds = letter.element.getBoundingClientRect();
      const glyph = letter.element.textContent;
      if (!masks.has(glyph)) masks.set(glyph, measureGlyph(maskContext, spinContext, canvasFont, glyph, baseline));
      const { mask, maskAt } = masks.get(glyph);
      letter.pivot = mask.pivot;
      letter.inertia = mask.inertia;
      return { letter, bounds, mask: maskAt(letter.angle), maskAt, pivot: mask.pivot, inertia: mask.inertia,
        x: bounds.left, y: bounds.top };
    });
    if (recovery || (!drag && draft?.route && time >= returnAt)) {
      regroup(bodies, gridBounds, time);
      return;
    }
    const grabbed = drag && bodies.find(body => body.letter === drag.letter);
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

    if (!drag && returnAt !== null && time >= returnAt && letters.some(letter => letter.angle)) {
      aligning = true;
    }
    // Leave settled letters tilted until the group is about to return.
    for (const body of bodies) {
      const { letter } = body;
      if (!aligning || !letter.angle) continue;
      body.uprighting = true;
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
      if (letter.angle) {
        letter.glyph.style.transformOrigin = `${body.pivot.x}px ${body.pivot.y}px`;
        letter.glyph.style.rotate = `${letter.angle}rad`;
      } else {
        letter.glyph.style.removeProperty("rotate");
      }
      if (body === grabbed) continue;
      if (!body.uprighting) {
        const spin = Math.abs(letter.omega);
        letter.omega = Math.sign(letter.omega) * Math.max(0, spin - (0.95 + spin * 1.45) * dt);
      }
      const speed = Math.hypot(letter.vx, letter.vy);
      if (speed) {
        const remaining = Math.max(0, speed - (245 + speed * 0.15) * dt) / speed;
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
    letter.x += x - bounds.left;
    letter.y += y - bounds.top;
    letter.element.style.transform = `translate(${letter.x}px, ${letter.y}px)`;
  }

  const observer = new ResizeObserver(() => {
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
    for (const letter of letters) {
      if (!letter.x && !letter.y) continue;
      const bounds = letter.element.getBoundingClientRect();
      placeLetter(letter, bounds.left, bounds.top, gridBounds, bounds);
    }
  });
  observer.observe(grid);
  return () => {
    observer.disconnect();
    cancelPlan();
    cancelAnimationFrame(letterFrame);
    clearTimeout(returnTimer);
    if (drag) drag.letter.element.classList.remove("is-dragging");
  };
}

function measureGlyph(context, spinContext, font, glyph, baseline) {
  context.font = font;
  const metrics = context.measureText(glyph);
  const left = Math.floor(-metrics.actualBoundingBoxLeft) - 1;
  const top = Math.floor(-metrics.actualBoundingBoxAscent) - 1;
  const width = Math.ceil(metrics.actualBoundingBoxRight) - left + 1;
  const height = Math.ceil(metrics.actualBoundingBoxDescent) - top + 1;
  context.canvas.width = width;
  context.canvas.height = height;
  context.font = font;
  context.fillText(glyph, -left, -top);
  const pixels = context.getImageData(0, 0, width, height).data;
  const mask = readGlyphMask(pixels, width, height, left, top + baseline);
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  source.getContext("2d").drawImage(context.canvas, 0, 0);
  return { mask, maskAt: createGlyphRotator(mask, source, spinContext) };
}

function setLetterMotion(letter, reason) {
  if (letter.motionReason === reason) return;
  letter.motionReason = reason;
  letter.element.dataset.motionReason = reason;
  console.debug(`[letters] ${letter.element.textContent} #${letter.index + 1}: ${reason}`);
}

export function stepLetterPhysics(bodies, bounds, dt, random = Math.random) {
  const fastest = Math.max(...bodies.map(({ letter, bounds }) =>
    Math.hypot(letter.vx, letter.vy) + Math.min(12, Math.abs(letter.omega ?? 0)) *
      Math.max(bounds.width, bounds.height)));
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
  return [Math.max(min, min - body.mask[edge] - 1),
    Math.min(max, bounds[opposite] - body.mask[edge] - body.mask[span] + 1)];
}

function rotateLetter(body, others, dt, bounds) {
  const { letter, maskAt } = body;
  if (!maskAt || !letter.omega) return;
  const omega = Math.max(-12, Math.min(12, letter.omega));
  let next = wrapAngle(letter.angle + omega * dt);
  if (body.uprighting && (Math.abs(next) < 0.006 || next * letter.angle < 0)) next = 0;
  const before = body.mask;
  const target = maskAt(next);
  const fits = () => ["x", "y"].every(axis => {
    const [min, max] = axisLimits(body, bounds, axis, Boolean(next));
    return body[axis] >= min - 0.01 && body[axis] <= max + 0.01;
  }) && !others.some(other => body !== other && glyphsOverlap(body, other));
  body.mask = target;
  if (!fits()) {
    body.mask = before;
    if (body.uprighting) {
      const x = body.x;
      const y = body.y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
        [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
        body.x = x + dx;
        body.y = y + dy;
        if (others.some(other => body !== other && glyphsOverlap(body, other))) continue;
        body.mask = target;
        if (fits()) {
          letter.angle = next;
          return;
        }
        body.mask = before;
      }
      body.x = x;
      body.y = y;
      letter.omega = 0;
    } else {
      letter.omega = -omega * 0.28;
    }
    return;
  }
  letter.angle = next;
  letter.omega = next || !body.uprighting ? omega : 0;
}

function moveLetterAxis(body, bodies, dt, axis, velocity, bounds, random) {
  const { letter } = body;
  const speed = letter[velocity];
  if (!speed) return;
  const [min, max] = axisLimits(body, bounds, axis);
  if (min > max) return;
  const previous = body[axis];
  const next = previous + speed * dt;
  body[axis] = Math.max(min, Math.min(max, next));

  for (const other of bodies) {
    if (other === body || !glyphsOverlap(body, other)) continue;
    const contact = glyphContact(body, other);
    body[axis] = previous;
    if (glyphsOverlap(body, other)) {
      body[axis] = Math.max(min, Math.min(max, next));
      continue;
    }
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

function setupBubbles(canvas, reducedMotion, updateGridBubbles, signal) {
  const context = canvas.getContext("2d");
  if (!context) return;
  let width = 0;
  let pageHeight = 0;
  let frame = 0;
  let heldBubble = null;
  let floatingBubbles = [];
  let nextDrift = 0;
  let nextBubbleId = 0;
  let ambientTimer = 0;
  const maxAmbientRadius = 11;
  const maxAmbientMergeRadius = 12;
  let contacts = new Map();
  let pops = [];
  const driftRates = [5, -17, 19, -5, 12, -12];

  function radiusAt(time) {
    const heldSeconds = Math.max(0, time - heldBubble.started) / 1000;
    const limit = Math.min(width, document.documentElement.clientHeight) * 0.2;
    return Math.min(limit, 7 + 31 * heldSeconds);
  }

  function drawBubble(x, y, radius) {
    context.globalAlpha = 0.35;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 0.48;
    context.beginPath();
    context.arc(x, y, radius * 0.78, Math.PI * 1.08, Math.PI * 1.4);
    context.stroke();
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

  function mergeOverlaps(positions, time) {
    const currentContacts = new Map();
    const consumed = new Set();
    const merged = [];

    for (let i = 0; i < positions.length; i++) {
      const a = positions[i];
      if (consumed.has(a.id)) continue;
      for (let j = i + 1; j < positions.length; j++) {
        const b = positions[j];
        if (consumed.has(b.id) ||
            Math.hypot(a.x - b.x, a.y - b.y) > a.radius + b.radius) continue;

        const radius = Math.hypot(a.radius, b.radius);
        const ambient = a.ambient && b.ambient;
        if (ambient && radius > maxAmbientMergeRadius) continue;

        const key = a.id + ":" + b.id;
        const deadline = contacts.get(key) ?? time + sampleDelay(500, 1000, 5000);
        if (time < deadline) {
          currentContacts.set(key, deadline);
          continue;
        }

        consumed.add(a.id);
        consumed.add(b.id);
        merged.push({
          id: nextBubbleId++,
          ambient,
          riseSpeed: (a.riseSpeed + b.riseSpeed) / 2,
          x: (a.x + b.x) / 2,
          y: (a.y + b.y) / 2,
          radius,
          drift: (a.drift + b.drift) / 2,
          released: time
        });
        break;
      }
    }

    contacts = currentContacts;
    if (!merged.length) return positions;
    floatingBubbles = floatingBubbles.filter(bubble => !consumed.has(bubble.id)).concat(merged);
    return positions.filter(bubble => !consumed.has(bubble.id)).concat(merged);
  }

  function drawBubbles(time) {
    const viewportTop = window.scrollY;
    const centers = [];
    if (heldBubble) {
      const radius = radiusAt(time);
      const y = heldBubble.y + viewportTop;
      centers.push({ x: heldBubble.x, y, radius });
      drawBubble(heldBubble.x, y, radius);
    }

    const positions = [];
    floatingBubbles = floatingBubbles.filter(bubble => {
      const seconds = Math.max(0, time - bubble.released) / 1000;
      const x = bubble.x + seconds * bubble.drift + Math.sin(seconds * 2.6) * 7;
      const riseSpeed = bubble.riseSpeed ?? 62 + bubble.radius * 0.34;
      const y = bubble.y - seconds * riseSpeed;
      const r = bubble.radius;
      if (y - r <= viewportTop || x - r <= 0 || x + r >= width) {
        pops.push(makePop(x, Math.max(viewportTop + r, y), r, time));
        return false;
      }
      positions.push({ id: bubble.id, x, y, radius: r, drift: bubble.drift,
        ambient: bubble.ambient, riseSpeed });
      return true;
    });

    for (const bubble of mergeOverlaps(positions, time)) {
      if (bubble.y - bubble.radius <= viewportTop) {
        floatingBubbles = floatingBubbles.filter(({ id }) => id !== bubble.id);
        pops.push(makePop(bubble.x, viewportTop + bubble.radius, bubble.radius, time));
        continue;
      }
      centers.push(bubble);
      drawBubble(bubble.x, bubble.y, bubble.radius);
    }

    pops = pops.filter(pop => {
      const progress = Math.max(0, time - pop.started) / 360;
      if (progress >= 1) return false;
      context.globalAlpha = 0.5 * (1 - progress);
      for (const particle of pop.particles) {
        const distance = particle.startDistance + progress * particle.travel;
        const drop = particle.downwardCurve * progress ** 2;
        context.beginPath();
        context.arc(pop.x + particle.dx * distance,
          pop.y + particle.dy * distance + drop, 1.15, 0, Math.PI * 2);
        context.fill();
      }
      return true;
    });
    context.globalAlpha = 1;
    updateGridBubbles(centers);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    width = bounds.width;
    pageHeight = bounds.height;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(pageHeight * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.strokeStyle = "#aaa";
    context.fillStyle = "#aaa";
    schedule();
  }

  function animate(time) {
    frame = 0;
    context.clearRect(0, 0, width, pageHeight);
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
        const radius = 4 + (maxRadius - 4) * Math.random() ** 12;
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
  window.addEventListener("scroll", schedule, { passive: true, signal });
  reducedMotion.addEventListener("change", () => {
    floatingBubbles = [];
    contacts.clear();
    pops = [];
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
