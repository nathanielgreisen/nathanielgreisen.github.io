import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  snapshotPathTemplate: "{testDir}/fixtures/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1200, height: 850 },
    launchOptions: { executablePath: process.env.CHROME_EXECUTABLE || undefined },
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
