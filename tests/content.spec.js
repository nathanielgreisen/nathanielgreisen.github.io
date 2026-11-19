import { expect, test } from "@playwright/test";

const routes = { home: "/", projects: "/projects/", notes: "/notes/" };

async function readContent(page) {
  return page.evaluate(() => {
    const details = [...document.querySelectorAll("details")];
    for (const detail of details) detail.open = true;
    return {
      title: document.title,
      canonical: document.querySelector('link[rel="canonical"]').getAttribute("href"),
      language: document.documentElement.lang,
      text: ["header", "main", "footer"].map(selector => document.querySelector(selector).innerText),
      headings: [...document.querySelectorAll("h1, h2")].map(heading => ({
        tag: heading.tagName,
        id: heading.id,
        text: heading.innerText,
      })),
      links: [...document.links].map(link => ({
        text: link.innerText, href: link.getAttribute("href"), current: link.getAttribute("aria-current"),
      })),
      disclosures: details.map(detail => detail.querySelector("summary").innerText),
      table: [...document.querySelectorAll("th, td")].map(cell => ({
        text: cell.innerText, scope: cell.getAttribute("scope"),
      })),
    };
  });
}

for (const [name, route] of Object.entries(routes)) {
  test(`${route} includes its content in the static build`, async ({ browser, baseURL }) => {
    const page = await browser.newPage({ javaScriptEnabled: false, baseURL });
    try {
      await page.goto(route);
      const content = await readContent(page);
      expect(content.canonical).toBe(new URL(route, "https://greisen.dev").href);
      if (process.env.BASELINE_URL) {
        await page.goto(new URL(route, process.env.BASELINE_URL).href);
        const original = await readContent(page);
        expect(content).toEqual(original);
        expect(JSON.stringify(original, null, 2) + "\n").toMatchSnapshot(`${name}.json`);
      } else {
        expect(JSON.stringify(content, null, 2) + "\n").toMatchSnapshot(`${name}.json`);
      }
    } finally {
      await page.close();
    }
  });
}

if (process.env.BASELINE_URL) {
  for (const width of [1200, 390]) {
    for (const route of Object.values(routes)) {
      test(`${route} matches the original layout at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 850 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(route);
        await expect.poll(() => page.locator(".intro-grid").evaluate(canvas => canvas.width)).toBeGreaterThan(300);
        const after = await page.screenshot({ fullPage: true, animations: "disabled" });
        await page.goto(new URL(route, process.env.BASELINE_URL).href);
        await expect.poll(() => page.locator(".intro-grid").evaluate(canvas => canvas.width)).toBeGreaterThan(300);
        const before = await page.screenshot({ fullPage: true, animations: "disabled" });
        expect(after.equals(before)).toBe(true);
      });
    }
  }
}
