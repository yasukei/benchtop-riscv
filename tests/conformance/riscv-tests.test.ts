import { readdirSync, readFileSync } from "node:fs";
import type { StopReason } from "@benchtop-riscv/core";
import { parseElf } from "@benchtop-riscv/elf";
import type { ElfFile } from "@benchtop-riscv/elf";
import { createTestBoard } from "@benchtop-riscv/machine";
import { disassemble } from "@benchtop-riscv/riscv";
import { describe, expect, it } from "vitest";

const fixtureDirectory = new URL("../fixtures/riscv-tests/", import.meta.url);
const fixtures = readdirSync(fixtureDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^rv32ui-p-[^.]+$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const instructionBudget = 1_000_000; // Instruction attempts, including traps; not instret.

function failureMessage(stop: StopReason, pc: number, elf: ElfFile): string {
  if (stop.kind === "halt") {
    return `Failed test number ${stop.exitCode} (HTIF exit code ${stop.exitCode})`;
  }
  const segment = elf.segments.find(
    (segment) => pc >= segment.paddr && pc + 4 <= segment.paddr + segment.fileBytes.length,
  );
  let instruction = "unavailable (PC outside file-backed ELF segments)";
  if (segment !== undefined) {
    const offset = pc - segment.paddr;
    const bytes = segment.fileBytes;
    const word = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      offset,
      true,
    );
    instruction = disassemble(word, pc);
  }
  const reason =
    stop.kind === "fatal"
      ? `fatal: ${stop.message}`
      : stop.kind === "budget"
        ? `budget exhausted after ${instructionBudget} instruction attempts`
        : stop.kind;
  // The original ELF is available without exposing the board's private RAM. Label it
  // explicitly: self-modifying code can differ from the original instruction bytes.
  return `${reason}; PC 0x${pc.toString(16).padStart(8, "0")}; ELF disassembly: ${instruction}`;
}

describe("rv32ui-p riscv-tests", () => {
  it("finds at least one ELF fixture", () => {
    expect(fixtures, "No rv32ui-p-* ELF fixtures found").not.toHaveLength(0);
  });

  it.each(fixtures)("%s", (name) => {
    const elf = parseElf(readFileSync(new URL(name, fixtureDirectory)));
    const board = createTestBoard();
    board.load(elf);
    const stop = board.run(instructionBudget);
    if (stop.kind !== "halt" || stop.exitCode !== 0) {
      throw new Error(`${name}: ${failureMessage(stop, board.hart.pc, elf)}`);
    }
  });
});

describe("riscv-tests failure diagnostics", () => {
  const elf = parseElf(readFileSync(new URL("rv32ui-p-add", fixtureDirectory)));

  it("reports the failing guest test number", () => {
    expect(failureMessage({ kind: "halt", exitCode: 17 }, elf.entry, elf)).toContain(
      "Failed test number 17 (HTIF exit code 17)",
    );
  });

  it.each([
    [{ kind: "budget" }, "budget exhausted after 1000000 instruction attempts"],
    [{ kind: "fatal", message: "internal failure" }, "fatal: internal failure"],
  ] as const)("reports the stop reason, PC and disassembly for %j", (stop, reason) => {
    const message = failureMessage(stop, 0x8000_0004, elf);
    expect(message).toContain(reason);
    expect(message).toContain("PC 0x80000004; ELF disassembly: csrr\tt5,mcause");
  });

  it("keeps the stop reason and PC when disassembly is unavailable", () => {
    expect(failureMessage({ kind: "budget" }, 0, elf)).toContain(
      "PC 0x00000000; ELF disassembly: unavailable",
    );
  });
});
