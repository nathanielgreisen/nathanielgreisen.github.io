import { readFile, readdir, writeFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { Site } from "./Site.jsx";

const output = new URL("../dist/", import.meta.url);
const root = /(<div id="root" data-page="([^"]+)">)<\/div>/;
const pages = (await readdir(output)).filter(filename => filename.endsWith(".html"));

await Promise.all(pages.map(async filename => {
  const file = new URL(filename, output);
  const html = await readFile(file, "utf8");
  const rendered = html.replace(root, (_, opening, page) =>
    `${opening}${renderToStaticMarkup(<Site page={page} />)}</div>`);
  if (rendered === html) throw new Error(`Missing page root in ${filename}`);
  await writeFile(file, rendered);
}));
