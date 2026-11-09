import { expect, test } from "@playwright/test";

test("loads the app and connects to the machine Worker without console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.url()}: ${response.status()}`);
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "benchtop-riscv" })).toBeVisible();
  await expect(page.getByLabel("Machine status")).toHaveText("Ready (rv32i)");
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute("type", "image/svg+xml");
  // Headless browsers do not always request favicons automatically.
  const status = await icon.evaluate(
    async (link: HTMLLinkElement) => (await fetch(link.href)).status,
  );
  expect(status).toBe(200);
  expect(errors).toEqual([]);
});
