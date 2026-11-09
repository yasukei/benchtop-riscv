import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

// Serves the GitHub Pages build under its sub-path and runs the smoke tests against it.
export default defineConfig(base, {
  projects: base.projects!.filter((project) => project.name === "chromium"),
  testMatch: "smoke.spec.ts",
  use: { baseURL: "http://127.0.0.1:4174/benchtop-riscv/" },
  webServer: {
    command:
      "pnpm --filter @benchtop-riscv/web build:pages && pnpm --filter @benchtop-riscv/web preview:pages --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174/benchtop-riscv/",
    stdout: "pipe",
    reuseExistingServer: !process.env.CI,
  },
});
