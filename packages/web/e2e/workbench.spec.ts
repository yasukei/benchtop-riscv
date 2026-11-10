import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { parseElf } from "@benchtop-riscv/elf";

const fixture = fileURLToPath(
  new URL("../../../tests/fixtures/riscv-tests/rv32ui-p-add", import.meta.url),
);

test("loads, steps and runs an ELF to pass, then resets it", async ({ page }) => {
  await page.goto("./");
  const run = page.getByRole("button", { name: "Run", exact: true });
  const step = page.getByRole("button", { name: "Step", exact: true });
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  const reset = page.getByRole("button", { name: "Reset", exact: true });
  await expect(run).toBeDisabled();
  await expect(step).toBeDisabled();
  await expect(pause).toBeDisabled();
  await expect(reset).toBeDisabled();
  await expect(page.getByLabel("ELF file", { exact: true })).toBeEnabled();
  await page.getByLabel("ELF file", { exact: true }).setInputFiles(fixture);
  await expect(page.getByLabel("Loaded file", { exact: true })).toHaveText("rv32ui-p-add");
  await expect(page.getByLabel("Execution status")).toHaveText("loaded");
  await expect(page.getByLabel("pc", { exact: true })).toHaveText("0x80000000");
  await expect(page.getByLabel("instret", { exact: true })).toHaveText("0");
  await expect(
    page.getByRole("region", { name: "Current instruction" }).locator("code"),
  ).toContainText("0x80000000: 0x0500006f");
  await expect(
    page.getByRole("region", { name: "Current instruction" }).locator("code"),
  ).toContainText("j");
  await step.click();
  await expect(page.getByLabel("pc", { exact: true })).toHaveText("0x80000050");
  await expect(page.getByLabel("pc", { exact: true }).locator("xpath=ancestor::tr")).toHaveClass(
    "changed",
  );
  await expect(page.getByLabel("instret", { exact: true })).toHaveText("1");
  await expect(page.getByLabel("Execution status")).toHaveText("paused");
  await run.click();
  await expect(page.getByLabel("Execution status")).toHaveText("halted · exit code 0 (pass)");
  await expect(run).toBeDisabled();
  await expect(step).toBeDisabled();
  await expect(pause).toBeDisabled();
  await reset.click();
  await expect(page.getByLabel("Execution status")).toHaveText("loaded");
  await expect(page.getByLabel("pc", { exact: true })).toHaveText("0x80000000");
  await expect(page.getByLabel("instret", { exact: true })).toHaveText("0");
  // Selecting the same file again must fire another load.
  await step.click();
  await expect(page.getByLabel("instret", { exact: true })).toHaveText("1");
  await page.getByLabel("ELF file", { exact: true }).setInputFiles(fixture);
  await expect(page.getByLabel("instret", { exact: true })).toHaveText("0");
});

test("reports a non-ELF load and recovers with a valid file", async ({ page }) => {
  await page.goto("./");
  const input = page.getByLabel("ELF file", { exact: true });
  await expect(input).toBeEnabled();
  const bad = {
    name: "not-an-elf.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("This is not an ELF file.\n"),
  };
  await input.setInputFiles(bad);
  await expect(page.getByRole("alert")).toContainText("loadError");
  await expect(page.getByRole("alert")).toContainText("not-an-elf.txt");
  await expect(page.getByRole("button", { name: "Step", exact: true })).toBeDisabled();
  await input.setInputFiles(fixture);
  await expect(page.getByLabel("Execution status")).toHaveText("loaded");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await input.setInputFiles(bad);
  await expect(page.getByRole("alert")).toContainText("not-an-elf.txt");
  await expect(page.getByLabel("Loaded file", { exact: true })).toHaveText("rv32ui-p-add");
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(page.getByLabel("instret", { exact: true })).toHaveText("1");
});

test("pauses a running program and resets it", async ({ page }) => {
  // Derive an endless program from the recorded fixture by replacing its entry
  // instruction with jal zero,0. No generated guest binary is stored in the repo.
  const image = await readFile(fixture);
  const elf = parseElf(image);
  const segment = elf.segments.find(
    (segment) =>
      elf.entry >= segment.paddr && elf.entry + 4 <= segment.paddr + segment.fileBytes.length,
  );
  if (!segment) throw new Error("Fixture entry is not backed by a loadable segment");
  new DataView(
    segment.fileBytes.buffer,
    segment.fileBytes.byteOffset,
    segment.fileBytes.byteLength,
  ).setUint32(elf.entry - segment.paddr, 0x0000_006f, true);
  await page.goto("./");
  const input = page.getByLabel("ELF file", { exact: true });
  await expect(input).toBeEnabled();
  await input.setInputFiles({
    name: "loop.elf",
    mimeType: "application/octet-stream",
    buffer: image,
  });
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByLabel("Execution status")).toHaveText("running");
  await expect(input).toBeDisabled();
  await expect(page.getByRole("button", { name: "Step", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByLabel("Execution status")).toHaveText("paused");
  const retired = await page.getByLabel("instret", { exact: true }).textContent();
  expect(Number(retired)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Step", exact: true }).click();
  await expect(page.getByLabel("instret", { exact: true })).toHaveText(String(Number(retired) + 1));
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByLabel("Execution status")).toHaveText("running");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Execution status")).toHaveText("loaded");
  await expect(page.getByLabel("instret", { exact: true })).toHaveText("0");
});
