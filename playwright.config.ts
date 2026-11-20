import { defineConfig } from "@playwright/test";
import { base, readPort, reuseExistingServer } from "./playwright.shared.js";

const port = readPort("E2E_PORT", 14173);
const url = `http://127.0.0.1:${port}`;

export default defineConfig(base, {
  use: { baseURL: url },
  webServer: {
    // CI builds in an earlier step; local runs build before starting preview.
    command:
      (process.env.CI ? "" : "pnpm build && ") +
      `pnpm --filter @benchtop-riscv/web preview --host 127.0.0.1 --port ${port} --strictPort`,
    url,
    reuseExistingServer,
  },
});
