import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

describe.each([
  {
    name: "app",
    load: () => import("../../playwright.config.js"),
    variable: "E2E_PORT",
    otherVariable: "E2E_PAGES_PORT",
    defaultPort: 14173,
    path: "",
  },
  {
    name: "Pages",
    load: () => import("../../playwright.pages.config.js"),
    variable: "E2E_PAGES_PORT",
    otherVariable: "E2E_PORT",
    defaultPort: 14174,
    path: "/benchtop-riscv/",
  },
])("$name Playwright config", ({ load, variable, otherVariable, defaultPort, path }) => {
  beforeEach(() => {
    vi.resetModules();
    for (const name of [variable, otherVariable, "PW_REUSE_SERVER", "CI"]) {
      vi.stubEnv(name, undefined);
    }
  });

  afterEach(() => vi.unstubAllEnvs());

  test("uses the default port and disables reuse by default", async () => {
    vi.stubEnv(otherVariable, "invalid");
    const { default: config } = await load();
    expect(config.use?.baseURL).toBe(`http://127.0.0.1:${defaultPort}${path}`);
    expect(config.webServer).toMatchObject([
      {
        command: expect.stringContaining(`--port ${defaultPort} --strictPort`),
        url: config.use?.baseURL,
        reuseExistingServer: false,
      },
    ]);
  });

  test.each([1, 65535])("uses port %i in the browser URL, server URL and command", async (port) => {
    vi.stubEnv(variable, String(port));
    const { default: config } = await load();
    expect(config.use?.baseURL).toBe(`http://127.0.0.1:${port}${path}`);
    expect(config.webServer).toMatchObject([
      {
        command: expect.stringContaining(`--port ${port} --strictPort`),
        url: config.use?.baseURL,
      },
    ]);
  });

  test.each(["", "abc", "0", "65536", "1.5", "1e3", "0x10"])(
    "rejects invalid port %j and names the variable",
    async (value) => {
      vi.stubEnv(variable, value);
      await expect(load()).rejects.toThrow(`${variable} must be an integer from 1 to 65535.`);
    },
  );

  test.each([
    { optIn: "1", ci: undefined, expected: true },
    { optIn: "true", ci: undefined, expected: false },
    { optIn: "1", ci: "true", expected: false },
  ])(
    "sets reuse to $expected with PW_REUSE_SERVER=$optIn and CI=$ci",
    async ({ optIn, ci, expected }) => {
      vi.stubEnv("PW_REUSE_SERVER", optIn);
      vi.stubEnv("CI", ci);
      const { default: config } = await load();
      expect(config.webServer).toMatchObject([{ reuseExistingServer: expected }]);
    },
  );
});
