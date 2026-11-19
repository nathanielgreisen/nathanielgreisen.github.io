import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const pageFiles = ["index.html", "projects/index.html", "notes/index.html"]
  .map(page => fileURLToPath(new URL(page, import.meta.url)));

export default defineConfig(({ isSsrBuild }) => ({
  base: "./",
  appType: "mpa",
  plugins: [react()],
  server: { host: "127.0.0.1" },
  build: isSsrBuild ? {} : {
    rolldownOptions: {
      input: pageFiles,
    },
  },
}));
