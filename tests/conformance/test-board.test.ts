import { readFileSync } from "node:fs";
import { parseElf } from "@benchtop-riscv/elf";
import { createTestBoard } from "@benchtop-riscv/machine";
import { describe, expect, it } from "vitest";

describe("test board guest execution", () => {
  it("runs the prebuilt rv32ui-p-simple fixture to HTIF success", () => {
    const bytes = readFileSync(new URL("../fixtures/riscv-tests/rv32ui-p-simple", import.meta.url));
    const board = createTestBoard();
    board.load(parseElf(bytes));
    expect(board.run(100_000)).toEqual({ kind: "halt", exitCode: 0 });
  });
});
