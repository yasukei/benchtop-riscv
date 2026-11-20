import { defineConfig } from "@playwright/test";
import { base, readPort, reuseExistingServer } from "./playwright.shared.js";

const port = readPort("E2E_PAGES_PORT", 14174);
const url = `http://127.0.0.1:${port}/benchtop-riscv/`;

// Serves the GitHub Pages build under its sub-path and runs the smoke tests against it.
export default defineConfig(base, {
  projects: base.projects!.filter((project) => project.name === "chromium"),
  testMatch: "smoke.spec.ts",
  use: { baseURL: url },
  webServer: {
    command:
      "pnpm --filter @benchtop-riscv/web build:pages && " +
      `pnpm --filter @benchtop-riscv/web preview:pages --host 127.0.0.1 --port ${port} --strictPort`,
    url,
    stdout: "pipe",
    reuseExistingServer,
  },
});
