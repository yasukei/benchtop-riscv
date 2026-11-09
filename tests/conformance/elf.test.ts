import { readFileSync } from "node:fs";
import { findSymbol, parseElf } from "@benchtop-riscv/elf";
import { describe, expect, it } from "vitest";

describe("riscv-tests ELF loading metadata", () => {
  it("parses rv32ui-p-add and locates tohost in a loadable segment", () => {
    const bytes = readFileSync(new URL("../fixtures/riscv-tests/rv32ui-p-add", import.meta.url));
    const file = parseElf(bytes);
    expect(file.entry).toBe(0x8000_0000);
    expect(file.segments.length).toBeGreaterThan(0);
    const tohost = findSymbol(file, "tohost");
    expect(tohost).toMatchObject({
      name: "tohost",
      value: 0x8000_1000,
      size: 8,
      type: 0, // The fixture encodes st_info = 0x10 (GLOBAL / NOTYPE).
      binding: 1,
    });
    expect(
      file.segments.some(
        (segment) =>
          segment.vaddr <= tohost!.value &&
          tohost!.value + tohost!.size <= segment.vaddr + segment.memSize,
      ),
    ).toBe(true);
  });
});
