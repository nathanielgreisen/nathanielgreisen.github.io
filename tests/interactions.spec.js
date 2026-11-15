import { expect, test } from "@playwright/test";

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

test("idle letters drift five pixels and return to their resting positions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("index.html");
  const letter = page.locator(".name-letter").first();
  const samples = await letter.evaluate(async element => {
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
  expect(await letter.evaluate(element => element.getAnimations().length)).toBe(0);
  await page.mouse.up();
  await expect.poll(() => letter.evaluate(element => element.getAnimations().length)).toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => letter.evaluate(element => element.getAnimations().length)).toBe(0);
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
