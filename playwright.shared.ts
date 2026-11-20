import { defineConfig, devices } from "@playwright/test";

export const base = defineConfig({
  testDir: "./packages/web/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
      },
    },
  ],
});

export const reuseExistingServer = !process.env.CI && process.env.PW_REUSE_SERVER === "1";

export function readPort(variable: "E2E_PORT" | "E2E_PAGES_PORT", defaultPort: number): number {
  const value = process.env[variable] ?? String(defaultPort);
  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65535) {
    throw new Error(`${variable} must be an integer from 1 to 65535.`);
  }
  return port;
}
