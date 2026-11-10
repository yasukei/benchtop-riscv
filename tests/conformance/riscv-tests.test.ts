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
// env/p other_exception writes TESTNUM | 1337; HTIF shifts that value right by one.
// The pinned rv32ui-p tests use TESTNUM <= 128, so ordinary failures cannot match.
const otherExceptionMask = 1337 >>> 1;

function failureMessage(stop: StopReason, pc: number, elf: ElfFile): string {
  if (stop.kind === "halt") {
    if ((stop.exitCode & otherExceptionMask) === otherExceptionMask) {
      return `Unexpected trap (riscv-tests other_exception; HTIF exit code ${stop.exitCode})`;
    }
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

  it.each([3, 17, 128])("reports the failing guest test number %i", (exitCode) => {
    expect(failureMessage({ kind: "halt", exitCode }, elf.entry, elf)).toBe(
      `Failed test number ${exitCode} (HTIF exit code ${exitCode})`,
    );
  });

  it.each([668, 669, 732])(
    "reports other_exception exit code %i as an unexpected trap",
    (exitCode) => {
      expect(failureMessage({ kind: "halt", exitCode }, elf.entry, elf)).toBe(
        `Unexpected trap (riscv-tests other_exception; HTIF exit code ${exitCode})`,
      );
    },
  );

  it("reports an illegal instruction in a guest as an unexpected trap", () => {
    // Patch a fresh in-memory copy of test_3's add; leave the committed fixture intact.
    const patchedElf = parseElf(readFileSync(new URL("rv32ui-p-add", fixtureDirectory)));
    const pc = 0x8000_01b0;
    const segment = patchedElf.segments.find(
      (segment) => pc >= segment.paddr && pc + 4 <= segment.paddr + segment.fileBytes.length,
    )!;
    const bytes = segment.fileBytes;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const offset = pc - segment.paddr;
    expect(view.getUint32(offset, true)).toBe(0x00c5_8733); // add a4,a1,a2
    view.setUint32(offset, 0, true); // Illegal instruction.

    const board = createTestBoard();
    board.load(patchedElf);
    const stop = board.run(instructionBudget);
    expect(stop).toEqual({ kind: "halt", exitCode: 669 });
    expect(failureMessage(stop, board.hart.pc, patchedElf)).toBe(
      "Unexpected trap (riscv-tests other_exception; HTIF exit code 669)",
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
