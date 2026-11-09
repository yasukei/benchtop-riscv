import { globSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// dependency-cruiser enforces the direction between packages, but it resolves undeclared workspace
// imports through the root node_modules. This checks that every package declares what it imports.

const root = resolve(import.meta.dirname, "../..");
const scope = "@benchtop-riscv/";

type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** Workspace packages imported by the given TypeScript sources, including type-only and dynamic imports. */
function importedWorkspacePackages(sources: readonly string[]): Set<string> {
  const imported = new Set<string>();
  for (const source of sources) {
    for (const { fileName } of ts.preProcessFile(source, true, true).importedFiles) {
      if (!fileName.startsWith(scope)) continue;
      const [, name] = fileName.slice(scope.length).match(/^([^/]+)/) ?? [];
      if (name) imported.add(scope + name);
    }
  }
  return imported;
}

const manifests = globSync("packages/*/package.json", { cwd: root }).sort();

describe("workspace package dependencies", () => {
  it("discovers workspace packages", () => {
    expect(manifests.length).toBeGreaterThan(0);
  });

  it.each(manifests)("%s declares every workspace package it imports", (file) => {
    const manifest = JSON.parse(readFileSync(resolve(root, file), "utf8")) as Manifest;
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]);
    const sources = globSync("{src,e2e}/**/*.{ts,tsx}", { cwd: resolve(root, dirname(file)) }).map(
      (path) => readFileSync(resolve(root, dirname(file), path), "utf8"),
    );
    const undeclared = [...importedWorkspacePackages(sources)]
      .filter((name) => name !== manifest.name && !declared.has(name))
      .sort();
    expect(undeclared).toEqual([]);
  });

  it("finds static, type-only, re-exported and dynamic workspace imports", () => {
    const imported = importedWorkspacePackages([
      'import { a } from "@benchtop-riscv/core";',
      'import type { B } from "@benchtop-riscv/elf";',
      'export { c } from "@benchtop-riscv/riscv/sub";',
      'const d = await import("@benchtop-riscv/devices");',
      'import { e } from "./local.js"; import f from "react";',
    ]);
    expect([...imported].sort()).toEqual([
      "@benchtop-riscv/core",
      "@benchtop-riscv/devices",
      "@benchtop-riscv/elf",
      "@benchtop-riscv/riscv",
    ]);
  });
});
