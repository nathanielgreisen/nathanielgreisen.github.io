const svgNamespace = "http://www.w3.org/2000/svg";
const displacementScale = 128;

function svg(tag, attributes = {}) {
  const element = document.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function setRegion(element, x, y, width, height) {
  for (const [name, value] of [["x", x], ["y", y], ["width", width], ["height", height]]) {
    const text = String(value);
    if (element.getAttribute(name) !== text) element.setAttribute(name, text);
  }
}

function makeMap(context, radius) {
  const size = context.canvas.width;
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const dy = (y + 0.5) * 2 / size - 1;
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) * 2 / size - 1;
      const distance = Math.hypot(dx, dy);
      if (distance >= 1) continue;
      // Keep the magnification strong across the face before easing it out at the rim.
      const bend = 0.94 * radius * (1 - distance ** 4) ** 2 * 255 / displacementScale;
      const offset = (y * size + x) * 4;
      image.data[offset] = 128 - dx * bend;
      image.data[offset + 1] = 128 - dy * bend;
      image.data[offset + 3] = 255 * Math.min(1, (1 - distance) * 9);
    }
  }
  context.putImageData(image, 0, 0);
  return context.canvas.toDataURL();
}

export function setupBubbleRefraction(heading) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 80;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  const intro = heading.closest(".home-intro");
  const glyphs = [...heading.querySelectorAll(".name-letter-glyph")];
  const definitions = svg("svg", { width: 0, height: 0, "aria-hidden": "true" });
  definitions.style.position = "absolute";
  const filter = svg("filter", {
    id: "name-bubble-refraction", filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB",
  });
  definitions.append(filter);
  intro.append(definitions);

  const maps = new Map();
  const images = [];
  const lenses = svg("feMerge", { result: "lenses" });
  const displacement = svg("feDisplacementMap", {
    in: "SourceGraphic", in2: "lenses", scale: displacementScale,
    xChannelSelector: "R", yChannelSelector: "G", result: "refracted",
  });
  const inside = svg("feComposite", { in: "refracted", in2: "lenses", operator: "in", result: "inside" });
  // Keep original pixels outside the lens and crossfade only along its rim.
  filter.append(
    lenses,
    displacement,
    inside,
    svg("feComposite", { in: "SourceGraphic", in2: "lenses", operator: "out", result: "outside" }),
    svg("feComposite", { in: "inside", in2: "outside", operator: "arithmetic", k2: 1, k3: 1 })
  );

  let active = false;
  function clear() {
    if (active) heading.style.removeProperty("filter");
    active = false;
  }

  function update(bubbles, scrollY) {
    if (!bubbles.length) return clear();
    const bounds = intro.getBoundingClientRect();
    const candidates = [];
    for (const { x, y, radius } of bubbles) {
      // Give quick-click bubbles enough room to visibly bend a stroke as they pass.
      const lensRadius = radius + Math.max(5, 10 - radius * 0.1);
      if (x + lensRadius > bounds.left && x - lensRadius < bounds.right &&
          y + lensRadius > bounds.top + scrollY && y - lensRadius < bounds.bottom + scrollY) {
        candidates.push({ x, y, radius: lensRadius });
      }
    }
    if (!candidates.length) return clear();

    const letters = glyphs.map(glyph => glyph.getBoundingClientRect());
    const visible = candidates.filter(({ x, y, radius }) => letters.some(letter => {
      const dy = Math.max(0, letter.top - (y - scrollY), y - scrollY - letter.bottom);
      const dx = Math.max(0, letter.left - x, x - letter.right);
      return dx * dx + dy * dy < radius * radius;
    }));
    if (!visible.length) return clear();

    const origin = heading.getBoundingClientRect();
    // Leave room for motion between frames without filtering the entire intro.
    const moving = glyphs.some(glyph => {
      const reason = glyph.parentElement.dataset.motionReason;
      return reason && reason !== "idle";
    });
    const padding = moving ? 96 : 12;
    const step = 32;
    const filterLeft = Math.max(bounds.left, Math.floor((Math.min(...letters.map(letter => letter.left)) - padding) / step) * step);
    const filterTop = Math.max(bounds.top, Math.floor((Math.min(...letters.map(letter => letter.top)) - padding) / step) * step);
    const filterRight = Math.min(bounds.right, Math.ceil((Math.max(...letters.map(letter => letter.right)) + padding) / step) * step);
    const filterBottom = Math.min(bounds.bottom, Math.ceil((Math.max(...letters.map(letter => letter.bottom)) + padding) / step) * step);
    setRegion(filter, filterLeft - origin.left, filterTop - origin.top, filterRight - filterLeft, filterBottom - filterTop);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    while (images.length > visible.length) {
      images.pop().remove();
      lenses.lastElementChild.remove();
    }
    for (const [i, { x, y, radius }] of visible.entries()) {
      if (!images[i]) {
        const result = `lens-map-${i}`;
        images.push(svg("feImage", { result, preserveAspectRatio: "none" }));
        filter.insertBefore(images[i], lenses);
        lenses.append(svg("feMergeNode", { in: result }));
      }
      // Reuse maps across nearby sizes while keeping the lens boundary exact.
      const size = Math.min(320, Math.round(radius / 4) * 4);
      if (!maps.has(size)) maps.set(size, makeMap(context, size));
      const url = maps.get(size);
      if (images[i].getAttribute("href") !== url) images[i].setAttribute("href", url);
      const lensX = x - radius - origin.left;
      const lensY = y - radius - scrollY - origin.top;
      setRegion(images[i], lensX, lensY, 2 * radius, 2 * radius);
      left = Math.min(left, lensX);
      top = Math.min(top, lensY);
      right = Math.max(right, lensX + 2 * radius);
      bottom = Math.max(bottom, lensY + 2 * radius);
    }
    for (const primitive of [displacement, inside]) setRegion(primitive, left, top, right - left, bottom - top);

    if (!active) heading.style.filter = "url(#name-bubble-refraction)";
    active = true;
  }

  return { update, dispose() { clear(); definitions.remove(); } };
}
