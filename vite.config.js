import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pages = ["index", "projects", "notes", "experiments", "replaying-robot-logs"];

export default defineConfig(({ isSsrBuild }) => ({
  base: "./",
  appType: "mpa",
  plugins: [react()],
  server: { host: "127.0.0.1" },
  build: isSsrBuild ? {} : {
    rolldownOptions: {
      input: pages.map(page => fileURLToPath(new URL(`./${page}.html`, import.meta.url))),
    },
  },
}));
