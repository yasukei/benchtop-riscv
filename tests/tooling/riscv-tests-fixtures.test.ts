import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const fixtures = resolve(import.meta.dirname, "../fixtures/riscv-tests");
const files = readdirSync(fixtures);
const read = (name: string) => readFileSync(resolve(fixtures, name), "utf8");
const readme = read("README.md");

describe("committed riscv-tests fixtures", () => {
  it("contains exactly the upstream rv32ui p list, with a dump and README entry for each", () => {
    // The verbatim upstream Makefrag is the membership record, independent of the builder.
    const source = read("rv32ui.Makefrag");
    const list = source.match(/rv32ui_sc_tests\s*=([\s\S]*?)rv32ui_p_tests/)?.[1];
    expect(list).toBeDefined();
    const expected = list!
      .replaceAll("\\", " ")
      .trim()
      .split(/\s+/)
      .map((test) => `rv32ui-p-${test}`)
      .sort();
    expect(expected).toContain("rv32ui-p-ma_data");
    expect(files.filter((name) => name.startsWith("rv32ui-p-")).sort()).toEqual(
      [...expected, ...expected.map((name) => `${name}.dump`)].sort(),
    );
    for (const name of expected) {
      expect(readme).toContain(`- \`${name}\``);
    }
  });

  it("contains executable little-endian ELF32 RISC-V binaries and disassemblies", () => {
    const binaries = files.filter((name) => /^rv32\w+-p-[^.]+$/.test(name));
    expect(binaries.length).toBeGreaterThan(0);
    for (const name of binaries) {
      const elf = readFileSync(resolve(fixtures, name));
      expect([...elf.subarray(0, 7)], name).toEqual([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1]);
      expect(elf.readUInt16LE(16), name).toBe(2); // ET_EXEC
      expect(elf.readUInt16LE(18), name).toBe(243); // EM_RISCV
      const dump = read(`${name}.dump`);
      expect(dump).toContain(`${name}:     file format elf32-littleriscv`);
      expect(dump).toContain("Disassembly of section .text.init:");
      expect(dump).toContain("<_start>:");
    }
  });

  it("ships the redistribution license and toolchain provenance", () => {
    expect(read("LICENSE")).toContain("Redistribution and use in source and binary forms");
    expect(readme).toContain("https://github.com/riscv-software-src/riscv-tests");
    expect(readme).toContain("env commit:");
    expect(readme).toMatch(/debian@sha256:[a-f0-9]{64}/);
    expect(readme).toContain(read("toolchain.txt").trim());
  });
});
