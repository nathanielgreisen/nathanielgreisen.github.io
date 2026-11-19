# Portfolio prototype

Vite builds the five portfolio pages at their existing HTML paths. React renders the page content at build time. The published pages load JavaScript for the interactions, with the letter and bubble effects loaded on the home page.

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
