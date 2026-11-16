import { expect, test } from "@playwright/test";

async function quickFlick(letter, { offset, dx = 0, dy, ms }) {
  await letter.evaluate((element, { offset, dx, dy, ms }) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    const event = {
      pointerId: 21, pointerType: "touch", isPrimary: true, button: 0,
      clientX: x + width * offset, clientY: y + height * 0.3, bubbles: true,
    };
    element.setPointerCapture = () => {};
    const down = new PointerEvent("pointerdown", { ...event, buttons: 1 });
    const up = new PointerEvent("pointerup", { ...event, clientX: event.clientX + dx, clientY: event.clientY + dy });
    Object.defineProperty(up, "timeStamp", { value: down.timeStamp + ms });
    element.dispatchEvent(down);
    element.dispatchEvent(up);
  }, { offset, dx, dy, ms });
}

test("project disclosures and note links work after hydration", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("index.html");
  const project = page.locator("details").first();
  await project.locator("summary").click();
  await expect(project.getByRole("link", { name: "View source on GitHub" })).toBeVisible();
  await project.locator("summary").click();
  await expect(project.getByRole("link", { name: "View source on GitHub" })).toBeHidden();

  await page.getByRole("link", { name: "View all projects" }).click();
  await expect(page).toHaveURL(/projects\.html$/);
  await expect(page.locator("details")).toHaveCount(5);
  await page.getByRole("link", { name: "Notes", exact: true }).click();
  await page.getByRole("link", { name: "Turning a bug into a test fixture" }).click();
  await expect(page).toHaveURL(/replaying-robot-logs\.html#fixtures$/);
  await expect(page.locator("#fixtures")).toBeVisible();
  await page.getByRole("link", { name: "Back to notes" }).click();
  await page.getByRole("link", { name: "Drawing the background grid" }).click();
  await expect(page.getByRole("heading", { name: "Drawing the background grid" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the intro grid reacts to the pointer", async ({ page }) => {
  await page.goto("experiments.html");
  const grid = page.locator(".intro-grid");
  await expect.poll(() => grid.evaluate(canvas => canvas.width)).toBeGreaterThan(300);
  const still = await grid.evaluate(canvas => canvas.toDataURL());
  const bounds = await grid.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height / 2);
  await expect.poll(() => grid.evaluate((canvas, original) => canvas.toDataURL() === original, still)).toBe(false);
});

test("letter movement bends the grid until the letters settle", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.999; });
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:00.100Z"));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("index.html");
  const grid = page.locator(".intro-grid");
  await expect.poll(() => grid.evaluate(canvas => canvas.width)).toBeGreaterThan(300);
  const readGrid = () => grid.evaluate(canvas => canvas.toDataURL());
  const initial = await readGrid();
  const first = page.locator(".name-letter").first();
  await first.evaluate(letter => {
    const { x, y, width, height } = letter.getBoundingClientRect();
    const event = {
      pointerId: 13, pointerType: "touch", isPrimary: true, button: 0,
      clientX: x + width / 2, clientY: y + height / 2,
    };
    letter.setPointerCapture = () => {};
    const down = new PointerEvent("pointerdown", { ...event, buttons: 1, bubbles: true });
    const up = new PointerEvent("pointerup", { ...event, clientY: event.clientY - 8, bubbles: true });
    Object.defineProperty(up, "timeStamp", { value: down.timeStamp + 38 });
    letter.dispatchEvent(down);
    letter.dispatchEvent(up);
  });
  await page.clock.runFor(100);
  expect((await readGrid()) === initial).toBe(false);
  await page.clock.runFor(2600);
  expect((await readGrid()) === initial).toBe(true);
});

test("all letters wait for shared stillness and coast when regrouping is interrupted", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("index.html");
  const letters = page.locator(".name-letter");
  const first = letters.nth(8);
  const second = letters.last();
  const firstHome = await first.boundingBox();
  const secondHome = await second.boundingBox();

  async function grab(letter) {
    const { x, y, width, height } = await letter.boundingBox();
    const center = { x: x + width / 2, y: y + height / 2 };
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await expect(letter).toHaveClass(/is-dragging/);
    return center;
  }

  let pointer = await grab(first);
  await page.mouse.move(pointer.x + 400, pointer.y);
  await page.clock.runFor(600);
  await page.mouse.up();
  const firstRest = await first.boundingBox();

  pointer = await grab(second);
  await page.mouse.move(pointer.x + 420, pointer.y + 100);
  await page.clock.runFor(3300);
  const secondRest = await second.boundingBox();
  expect(await first.boundingBox()).toEqual(firstRest);
  await page.mouse.up();
  await page.clock.runFor(2900);
  await expect(page.locator("#name")).toHaveAttribute("data-return-plan", "ready");
  expect(await first.boundingBox()).toEqual(firstRest);
  expect(await second.boundingBox()).toEqual(secondRest);

  await page.clock.runFor(1100);
  const movingFirst = await first.boundingBox();
  const movingSecond = await second.boundingBox();
  expect(movingFirst.x).toBeLessThan(firstRest.x - 10);
  expect(movingSecond.x).toBeLessThan(secondRest.x - 10);

  await grab(first);
  await expect(second).toHaveAttribute("data-motion-reason", "coasting");
  await page.clock.runFor(200);
  expect((await second.boundingBox()).x).toBeLessThan(movingSecond.x - 5);
  expect(await first.boundingBox()).toEqual(movingFirst);
  await page.clock.runFor(3300);
  await expect(second).toHaveAttribute("data-motion-reason", "idle");
  await page.mouse.up();
  await page.clock.runFor(150);
  await expect(page.locator("#name")).toHaveAttribute("data-return-plan", "ready");
  await page.clock.runFor(7200);
  expect(await first.boundingBox()).toEqual(firstHome);
  expect(await second.boundingBox()).toEqual(secondHome);
});

test("two displaced letters find their way home around each other", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.75; });
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("index.html");
  const letters = page.locator(".name-letter");
  const positions = () => letters.evaluateAll(elements => elements.map(element => {
    const { x, y } = element.getBoundingClientRect();
    return [x, y];
  }));
  const originalPositions = await positions();
  const first = letters.nth(8);
  const second = letters.last();
  const firstHome = await first.boundingBox();
  const secondHome = await second.boundingBox();

  async function move(letter, ...points) {
    const bounds = await letter.boundingBox();
    const dx = bounds.width / 2;
    const dy = bounds.height / 2;
    await page.mouse.move(bounds.x + dx, bounds.y + dy);
    await page.mouse.down();
    await expect(letter).toHaveClass(/is-dragging/);
    for (const point of points) {
      await page.mouse.move(point.x + dx, point.y + dy);
      await page.clock.runFor(280);
    }
    await page.mouse.up();
  }

  // Use the open space to the right to arrange a head-on return.
  const stagingX = firstHome.x + 160;
  await move(second, { x: stagingX, y: secondHome.y });
  await move(first, { x: firstHome.x + 5, y: secondHome.y + 4 });
  await move(second, { x: stagingX, y: firstHome.y - 4 }, { x: firstHome.x + 5, y: firstHome.y - 4 });
  const swappedFirst = await first.boundingBox();
  const swappedSecond = await second.boundingBox();
  expect(swappedFirst.y - firstHome.y).toBeGreaterThan(85);
  expect(secondHome.y - swappedSecond.y).toBeGreaterThan(85);
  await page.clock.runFor(150);
  await expect(page.locator("#name")).toHaveAttribute("data-return-plan", "ready");
  await page.clock.runFor(7200);
  expect(await first.boundingBox()).toEqual(firstHome);
  expect(await second.boundingBox()).toEqual(secondHome);
  expect(await positions()).toEqual(originalPositions);
});

for (const width of [1200, 390]) {
  for (const seed of [0.25, 0.75]) {
    test(`all letters settle within 15 seconds after a pileup at ${width}px, seed ${seed}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 850 });
      await page.addInitScript(value => { Math.random = () => value; }, seed);
      await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
      await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("index.html");
      const letters = page.locator(".name-letter");
      const positions = () => letters.evaluateAll(elements =>
        elements.map(el => [el.getBoundingClientRect().left, el.getBoundingClientRect().top]));
      const home = await positions();
      const grid = await page.locator(".home-intro").boundingBox();

      async function drag(index, ...points) {
        const glyph = letters.nth(index);
        const rect = await glyph.boundingBox();
        const x = rect.width / 2;
        const y = rect.height / 2;
        await page.mouse.move(rect.x + x, rect.y + y);
        await page.mouse.down();
        for (const [left, top] of points) {
          await page.mouse.move(left + x, top + y);
          await page.clock.runFor(240);
        }
        await page.mouse.up();
      }

      if (width === 1200) {
        await drag(9, [home[9][0], grid.y + 365], [2, grid.y + 365]);
        await drag(0, [home[0][0], home[9][1] + 8]);
        await drag(9, [2, home[0][1] - 8], [home[0][0], home[0][1] - 8]);
      } else {
        for (const index of [0, 9, 8, 15, 1]) {
          await drag(index, [2, grid.y + 100], [grid.width * 0.6, grid.y + 135]);
        }
      }

      const disturbed = await positions();
      expect(disturbed.filter(([x, y], i) => Math.hypot(x - home[i][0], y - home[i][1]) > 1).length)
        .toBeGreaterThanOrEqual(3);
      let elapsed = 0;
      while (elapsed < 8000 && !await page.locator("#name").getAttribute("data-return-plan")) {
        await page.clock.runFor(250);
        elapsed += 250;
      }
      await expect(page.locator("#name")).toHaveAttribute("data-return-plan", "ready");
      await page.clock.runFor(14_500 - elapsed);
      expect(await positions()).toEqual(home);
    });
  }
}

for (const width of [390, 1200]) {
  test(`a cluster scattered by quick flicks at ${width}px returns home within 15 seconds`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("index.html");
    await page.evaluate(() => {
      let seed = 2;
      Math.random = () => {
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
        return seed / 2 ** 32;
      };
    });
    const letters = page.locator(".name-letter");
    const atRest = () => letters.evaluateAll(elements =>
      elements.every(element => !element.style.transform && !element.firstElementChild.style.rotate));
    for (const [index, offset, dx, dy] of [
      [3, 0.282, -113.318, 17.361],
      [1, 0.481, -88.399, 15.736],
      [11, 0.547, -118.706, -2.928],
      [7, 0.389, -140.836, -6.541],
      [14, 0.669, 72.918, -20.223],
    ]) {
      await quickFlick(letters.nth(index), { offset, dx, dy, ms: 50 });
      await page.clock.runFor(120);
    }
    expect(await atRest()).toBe(false);

    const name = page.locator("#name");
    for (let elapsed = 120; elapsed < 15_000 && !await atRest(); elapsed += 240) {
      await page.clock.runFor(240);
      if (await name.getAttribute("data-return-plan") === "planning") {
        await expect(name).toHaveAttribute("data-return-plan", "ready");
      }
    }
    expect(await atRest()).toBe(true);
  });
}

test("the five pixel drift continues through a grab without moving the physics box", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("index.html");
  const letter = page.locator(".name-letter").first();
  const glyph = letter.locator(".name-letter-glyph");
  const samples = await glyph.evaluate(async element => {
    const animation = element.getAnimations()[0];
    const { duration } = animation.effect.getTiming();
    animation.pause();
    await animation.ready;
    return [0, 0.25, 0.5, 0.75, 1].map(progress => {
      animation.currentTime = duration * progress;
      const { x, y } = element.getBoundingClientRect();
      return { x, y };
    });
  });

  const [origin, firstDrift, midpoint, secondDrift, end] = samples;
  const distance = point => Math.hypot(point.x - origin.x, point.y - origin.y);
  expect(distance(firstDrift)).toBeCloseTo(5);
  expect(distance(secondDrift)).toBeCloseTo(5);
  expect(midpoint).toEqual(origin);
  expect(end).toEqual(origin);

  const bounds = await letter.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(letter).toHaveClass(/is-dragging/);
  await glyph.evaluate(element => {
    element.getAnimations()[0].currentTime = element.getAnimations()[0].effect.getTiming().duration / 4;
  });
  expect(await glyph.boundingBox()).toMatchObject(firstDrift);
  expect(await letter.boundingBox()).toEqual(bounds);
  await page.mouse.up();
  expect(await glyph.evaluate(element => element.getAnimations().length)).toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => glyph.evaluate(element => element.getAnimations().length)).toBe(0);
});

test("a dragged letter transfers momentum to other letters", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("index.html");
  const letters = page.locator(".name-letter");
  await expect(letters).toHaveCount(16);
  const first = await letters.first().boundingBox();
  const positions = () => letters.evaluateAll(elements =>
    elements.map(element => element.getBoundingClientRect().left));
  const before = await positions();
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await expect(letters.first()).toHaveClass(/is-dragging/);
  await page.mouse.move(first.x + first.width / 2 + 70, first.y + first.height / 2);
  await expect.poll(async () => (await positions())[1]).toBeGreaterThan(before[1] + 1);
  await page.mouse.up();
  const released = await positions();
  await expect.poll(async () => (await positions()).some((x, index) =>
    index > 0 && Math.abs(x - released[index]) > 1)).toBe(true);
});

test("a flick between animation frames launches a letter at the pointer's speed", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });

  async function flick(duration, releaseOnly = false) {
    await page.goto("index.html");
    const letter = page.locator(".name-letter").first();
    const bounds = await letter.boundingBox();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    await page.evaluate(() => {
      window.addEventListener("pointerdown", event => {
        window.initialPointer = { id: event.pointerId, time: event.timeStamp };
      }, { once: true });
    });
    await page.mouse.move(x, y);
    await page.mouse.down();
    await expect(letter).toHaveClass(/is-dragging/);

    // Deliver the entire flick before giving the animation loop a frame.
    await page.evaluate(({ x, y, duration, releaseOnly }) => {
      const { id, time } = window.initialPointer;
      const events = releaseOnly ? ["pointerup"] : ["pointermove", "pointerup"];
      for (const type of events) {
        const moving = type === "pointermove";
        const event = new PointerEvent(type, {
          button: moving ? -1 : 0, buttons: moving ? 1 : 0,
          pointerId: id, pointerType: "mouse", isPrimary: true, clientX: x, clientY: y - 12,
        });
        Object.defineProperty(event, "timeStamp", { value: time + duration + (moving ? 0 : 1) });
        window.dispatchEvent(event);
      }
    }, { x, y, duration, releaseOnly });
    await page.mouse.up();
    expect((await letter.boundingBox()).y).toBe(bounds.y);
    await page.clock.runFor(64);
    return bounds.y - (await letter.boundingBox()).y;
  }

  const slow = await flick(48);
  const fast = await flick(6);
  const releaseOnly = await flick(6, true);
  expect(slow).toBeGreaterThan(5);
  expect(fast).toBeGreaterThan(slow * 3);
  expect(releaseOnly).toBeGreaterThan(slow * 3);
});

test("an off-center flick spins a letter, which straightens before the home route", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("index.html");
  const letter = page.locator(".name-letter").last();
  const glyph = letter.locator(".name-letter-glyph");
  const home = await letter.boundingBox();
  const x = home.x + home.width / 2;
  const y = home.y + home.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 300, y);
  await page.clock.runFor(500);
  await page.mouse.up();
  await page.clock.runFor(20);

  await quickFlick(letter, { offset: 0.15, dy: 18, ms: 40 });
  await page.clock.runFor(120);
  expect(await glyph.evaluate(element => parseFloat(element.style.rotate))).toBeLessThan(-0.05);

  await page.clock.runFor(1600);
  const restingAngle = await glyph.evaluate(element => element.style.rotate);
  expect(restingAngle).not.toBe("");
  await page.clock.runFor(700);
  expect(await glyph.evaluate(element => element.style.rotate)).toBe(restingAngle);
  await expect(page.locator("#name")).not.toHaveAttribute("data-return-plan");

  for (let i = 0; i < 24 && !await page.locator("#name").getAttribute("data-return-plan"); i++) {
    await page.clock.runFor(200);
  }
  await expect(page.locator("#name")).toHaveAttribute("data-return-plan", "ready");
  expect(await glyph.evaluate(element => element.style.rotate)).toBe("");
  expect((await letter.boundingBox()).x).toBeGreaterThan(home.x + 50);
  await page.clock.runFor(8200);
  expect(await letter.boundingBox()).toEqual(home);
});

for (const [side, width] of [["left", 1200], ["right", 390]]) {
  test(`a letter flicked at the ${side} edge returns without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("index.html");
    const letter = page.locator(".name-letter").last();
    const home = await letter.boundingBox();
    const grid = await page.locator(".home-intro").boundingBox();
    const edge = side === "left" ? grid.x : grid.x + grid.width - home.width;
    const stagingX = grid.x + grid.width * 0.84;
    const stagingY = grid.y + 8 + home.height / 2;
    await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2);
    await page.mouse.down();
    await page.mouse.move(stagingX, home.y + home.height / 2);
    await page.clock.runFor(500);
    await page.mouse.move(stagingX, stagingY);
    await page.clock.runFor(500);
    await page.mouse.move(side === "left" ? 1 : width - 1, stagingY);
    await page.clock.runFor(800);
    await page.mouse.up();
    await page.clock.runFor(64);
    expect((await letter.boundingBox()).x).toBeCloseTo(edge, 1);

    // Sample the outward part of the drift while the letter touches the wall.
    await letter.evaluate((element, outward) => {
      const glyph = element.firstElementChild;
      const animation = glyph.getAnimations()[0];
      animation.pause();
      const { duration, delay } = animation.effect.getTiming();
      const driftX = parseFloat(getComputedStyle(glyph).getPropertyValue("--drift-x"));
      animation.currentTime = delay + duration * (Math.sign(driftX) === outward ? 0.25 : 0.75);
    }, side === "left" ? -1 : 1);
    const hasOverflow = () => page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(await hasOverflow()).toBe(false);

    await quickFlick(letter, { offset: side === "left" ? 0.15 : 0.85, dy: 18, ms: 40 });
    await page.clock.runFor(120);
    expect(await letter.locator(".name-letter-glyph").evaluate(element => element.style.rotate)).not.toBe("");

    for (let elapsed = 120; elapsed < 15_000; elapsed += 240) {
      expect(await hasOverflow()).toBe(false);
      if (!(await letter.getAttribute("style"))?.includes("translate")) break;
      await page.clock.runFor(240);
      if (await page.locator("#name").getAttribute("data-return-plan") === "planning") {
        await expect(page.locator("#name")).toHaveAttribute("data-return-plan", "ready");
      }
    }
    expect(await letter.boundingBox()).toEqual(home);
    expect(await hasOverflow()).toBe(false);
  });
}

test("a held bubble grows, survives an interrupted release, and pops at the viewport top", async ({ page }) => {
  await page.addInitScript(() => {
    window.bubbleArcs = [];
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (x, y, radius, ...args) {
      if (this.canvas.classList.contains("page-bubbles")) {
        window.bubbleArcs.push([x, y, radius]);
      }
      return arc.call(this, x, y, radius, ...args);
    };
  });
  await page.goto("index.html");
  const canvas = page.locator(".page-bubbles");
  await expect.poll(() => canvas.evaluate(element => element.width)).toBeGreaterThan(300);
  await page.evaluate(() => { document.body.style.minHeight = "1500px"; });
  await page.mouse.move(1000, 460);
  await page.mouse.down();
  await expect(page.locator("body")).toHaveClass(/forming-bubble/);
  await expect.poll(() => page.evaluate(() => window.bubbleArcs.some(([x, , r]) => x === 1000 && r > 13))).toBe(true);
  await page.evaluate(() => {
    window.bubbleArcs.length = 0;
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, pointerType: "mouse" }));
  });
  await page.mouse.up();
  await expect(page.locator("body")).not.toHaveClass(/forming-bubble/);
  await expect.poll(() => page.evaluate(() => window.bubbleArcs.some(([x, y, r]) =>
    Math.abs(x - 1000) < 20 && y < 450 && r > 13))).toBe(true);

  await page.evaluate(() => {
    window.bubbleArcs.length = 0;
    window.scrollTo(0, 480);
  });
  await expect.poll(() => page.evaluate(() => window.bubbleArcs.some(([x, , r]) =>
    Math.abs(x - 1000) < 55 && r === 1.15))).toBe(true);
});
