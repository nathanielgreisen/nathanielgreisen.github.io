import { readFile, readdir, writeFile } from "node:fs/promises";
import { renderToString } from "react-dom/server";
import { Site } from "./Site.jsx";

const output = new URL("../dist/", import.meta.url);
for (const filename of await readdir(output)) {
  if (!filename.endsWith(".html")) continue;
  const file = new URL(filename, output);
  const html = await readFile(file, "utf8");
  const root = /(<div id="root" data-page="([^"]+)">)<\/div>/;
  if (!root.test(html)) throw new Error(`Missing React mount in ${filename}`);
  await writeFile(file, html.replace(root, (_, opening, page) =>
    `${opening}${renderToString(<Site page={page} />)}</div>`));
}
