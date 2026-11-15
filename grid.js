const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const canvas = document.querySelector(".intro-grid");
const intro = canvas.parentElement;
const context = canvas.getContext("2d");
let updateGridBubbles = () => {};

if (context) {
  const pointer = { x: 0, y: 0, inside: false };
  const bend = { x: 0, y: 0, strength: 0 };
  let width = 0;
  let height = 0;
  let frame = 0;

  let liveBubbles = [];
  let gridHasBubbles = false;

  function localFields() {
    if (!liveBubbles.length) return [];
    const bounds = canvas.getBoundingClientRect();
    return liveBubbles.flatMap(bubble => {
      const reach = bubble.radius * 2.3;
      const x = bubble.x - bounds.left;
      const y = bubble.y - bounds.top;
      if (x + reach < 0 || x - reach > width || y + reach < 0 || y - reach > height) return [];
      return [{ x, y, reach }];
    });
  }

  function warpPoint(x, y, fields) {
    const dx = x - bend.x;
    const dy = y - bend.y;
    const cursorForce = Math.max(0, 1 - Math.hypot(dx, dy) / 110) ** 2 * bend.strength;
    let shiftX = dx * cursorForce;
    let shiftY = dy * cursorForce;
    let bubbleHighlight = 0;

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

    const shift = Math.hypot(shiftX, shiftY);
    const scale = shift > 42 ? 42 / shift : 1;
    return { x: x + shiftX * scale, y: y + shiftY * scale, cursorForce, bubbleHighlight };
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
        const pointAt = offset => warpPoint(vertical ? fixed : offset,
          vertical ? offset : fixed, lineFields);
        let start = pointAt(0);
        for (let offset = 0; offset < length; offset += 8) {
          const end = pointAt(Math.min(offset + 8, length));
          const x = vertical ? fixed : offset;
          const xWeight = Math.max(0, (x - width * 0.2) / Math.max(1, width * 0.8));
          context.globalAlpha = 0.025 + 0.11 * xWeight +
            0.33 * start.cursorForce + 0.24 * start.bubbleHighlight;
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

  updateGridBubbles = bubbles => {
    liveBubbles = bubbles;
    if (gridHasBubbles || localFields().length) schedule();
  };

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
  }, { passive: true });

  function leave() {
    pointer.inside = false;
    schedule();
  }

  intro.addEventListener("pointerleave", leave);
  intro.addEventListener("pointercancel", leave);
  reducedMotion.addEventListener("change", () => {
    pointer.inside = false;
    bend.strength = 0;
    draw();
  });
  new ResizeObserver(resize).observe(intro);
  resize();
}

const bubbleCanvas = document.querySelector(".page-bubbles");
if (bubbleCanvas) setupBubbles(bubbleCanvas);

function setupBubbles(canvas) {
  const context = canvas.getContext("2d");
  if (!context) return;
  let width = 0;
  let height = 0;
  let frame = 0;
  let heldBubble = null;
  let floatingBubbles = [];
  let nextDrift = 0;
  let nextBubbleId = 0;
  let ambientTimer = 0;
  const maxAmbientRadius = 8;
  const maxAmbientMergeRadius = 10;
  let contacts = new Map();
  let pops = [];
  const driftRates = [5, -17, 19, -5, 12, -12];

  function radiusAt(time) {
    const heldSeconds = Math.max(0, time - heldBubble.started) / 1000;
    const limit = Math.min(width, height) * 0.2;
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

  function mergeOverlaps(positions, time, scrollY) {
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
          y: (a.y + b.y) / 2 + scrollY,
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
    return positions.filter(bubble => !consumed.has(bubble.id))
      .concat(merged.map(bubble => ({ ...bubble, y: bubble.y - scrollY })));
  }

  function drawBubbles(time) {
    const scrollY = window.scrollY;
    const centers = [];
    if (heldBubble) {
      const radius = radiusAt(time);
      centers.push({ x: heldBubble.x, y: heldBubble.y, radius });
      drawBubble(heldBubble.x, heldBubble.y, radius);
    }

    const positions = [];
    floatingBubbles = floatingBubbles.filter(bubble => {
      const seconds = Math.max(0, time - bubble.released) / 1000;
      const x = bubble.x + seconds * bubble.drift + Math.sin(seconds * 2.6) * 7;
      const riseSpeed = bubble.riseSpeed ?? 62 + bubble.radius * 0.34;
      const y = bubble.y - scrollY - seconds * riseSpeed;
      const r = bubble.radius;
      if (y - r <= 0 || (y - r < height && (x - r <= 0 || x + r >= width))) {
        pops.push(makePop(x, Math.max(r, y) + scrollY, r, time));
        return false;
      }
      if (y - r < height) {
        positions.push({ id: bubble.id, x, y, radius: r, drift: bubble.drift,
          ambient: bubble.ambient, riseSpeed });
      }
      return true;
    });

    for (const bubble of mergeOverlaps(positions, time, scrollY)) {
      if (bubble.y <= bubble.radius) {
        floatingBubbles = floatingBubbles.filter(({ id }) => id !== bubble.id);
        pops.push(makePop(bubble.x, bubble.radius + scrollY, bubble.radius, time));
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
          pop.y - scrollY + particle.dy * distance + drop, 1.15, 0, Math.PI * 2);
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
    height = bounds.height;
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.strokeStyle = "#aaa";
    context.fillStyle = "#aaa";
    schedule();
  }

  function animate(time) {
    frame = 0;
    context.clearRect(0, 0, width, height);
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
      if (width > 32 && height > 32 && floatingBubbles.length < 48) {
        const maxRadius = Math.min(maxAmbientRadius, width * 0.2, height * 0.2);
        const radius = 4 + (maxRadius - 4) * Math.random() ** 8;
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

  window.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.pointerType !== "mouse" || event.button !== 0 ||
        reducedMotion.matches) return;
    heldBubble = {
      x: event.clientX,
      y: event.clientY,
      started: performance.now(),
      pointerId: event.pointerId
    };
    document.body.classList.add("forming-bubble");
    schedule();
  }, { passive: true });

  window.addEventListener("pointermove", event => {
    if (heldBubble?.pointerId !== event.pointerId) return;
    if (!(event.buttons & 1)) {
      cancelHold();
      return;
    }
    heldBubble.x = event.clientX;
    heldBubble.y = event.clientY;
  }, { passive: true });

  window.addEventListener("pointerup", event => {
    if (heldBubble?.pointerId !== event.pointerId || event.button !== 0) return;
    const time = performance.now();
    if (floatingBubbles.length >= 48) floatingBubbles.shift();
    floatingBubbles.push({
      id: nextBubbleId++,
      x: event.clientX,
      y: event.clientY + window.scrollY,
      radius: radiusAt(time),
      released: time,
      drift: driftRates[nextDrift]
    });
    nextDrift = (nextDrift + 1) % driftRates.length;
    cancelHold();
  }, { passive: true });

  window.addEventListener("pointercancel", event => {
    if (heldBubble?.pointerId === event.pointerId) cancelHold();
  });
  window.addEventListener("blur", cancelHold);
  window.addEventListener("scroll", schedule, { passive: true });
  reducedMotion.addEventListener("change", () => {
    floatingBubbles = [];
    contacts.clear();
    pops = [];
    cancelHold();
    scheduleAmbientBubble();
  });
  document.addEventListener("visibilitychange", scheduleAmbientBubble);
  new ResizeObserver(resize).observe(canvas);
  resize();
  scheduleAmbientBubble();
}

for (const row of document.querySelectorAll(".project-list summary")) {
  row.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    const bounds = row.getBoundingClientRect();
    row.style.setProperty("--pointer-x", (event.clientX - bounds.left) + "px");
  }, { passive: true });
}
