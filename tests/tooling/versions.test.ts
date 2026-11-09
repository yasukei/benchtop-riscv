import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const version = (JSON.parse(read("package.json")) as { version: string }).version;
const packages = globSync("packages/*/package.json", { cwd: root }).sort();

describe("repository release version", () => {
  it("discovers workspace packages", () => {
    expect(packages.length).toBeGreaterThan(0);
  });

  it.each(packages)("%s agrees with the root version", (file) => {
    expect((JSON.parse(read(file)) as { version: string }).version).toBe(version);
  });
});
