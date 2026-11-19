# Portfolio prototype

Vite builds the portfolio at `/`, `/projects/`, and `/notes/`. React renders the page content at build time. The published pages load JavaScript for the interactions, with the letter and bubble effects loaded on the home page.

```sh
npm ci
npm run dev
```

Use Node.js 24 or newer. To verify the production build:

```sh
npx playwright install chromium
npm test
```

`npm run build` produces the static site in `dist/`. Use `npm run preview` to check the build locally.

## Publish to greisen.dev

1. In the repository’s **Settings → Pages**, select **GitHub Actions** as the source, set the custom domain to `greisen.dev`, and confirm that DNS points to GitHub Pages. Enable **Enforce HTTPS** when available. [GitHub’s custom domain guide](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
2. Once the workflow is on the default branch, open **Actions → Verify portfolio prototype → Run workflow**. Select the branch you want to release and check **Publish the verified site to GitHub Pages**. The `github-pages` environment must allow deployment from that branch. [GitHub’s workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

Pushes to `portfolio-prototype` run the tests and upload a build artifact. Publishing runs when you select the publish option.
