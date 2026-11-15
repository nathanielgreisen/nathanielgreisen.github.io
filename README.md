# Portfolio prototype

This branch contains the React portfolio. Vite builds each of the five pages at its existing HTML path. The build prerenders the page content, then React loads in the browser to enable the canvas interactions.

```sh
npm ci
npm run dev
```

Use Node.js 24 or newer. To verify the production build:

```sh
npx playwright install chromium
npm test
```

`npm run build` produces the site in `dist/`. Serve or upload that directory to GitHub Pages. The prerender step runs during the build, and the published site consists of static files. The prototype workflow tests the branch and saves `dist/` as a build artifact.
