import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { disassemble } from "@benchtop-riscv/riscv";

// GNU objdump output copied from the committed fixtures, excluding symbol annotations
// and address comments. Keep source, pc and word so the table remains independently checkable.
const objdumpTable = [
  ["add", 0x80000004, 0x34202f73, "csrr\tt5,mcause"],
  ["add", 0x80000008, 0x00800f93, "li\tt6,8"],
  ["add", 0x8000000c, 0x03ff0863, "beq\tt5,t6,8000003c"],
  ["add", 0x80000024, 0x000f0463, "beqz\tt5,8000002c"],
  ["add", 0x80000028, 0x000f0067, "jr\tt5"],
  ["add", 0x80000030, 0x000f5463, "bgez\tt5,80000038"],
  ["add", 0x80000034, 0x0040006f, "j\t80000038"],
  ["add", 0x80000038, 0x5391e193, "or\tgp,gp,1337"],
  ["add", 0x8000003c, 0x00001f17, "auipc\tt5,0x1"],
  ["add", 0x80000040, 0xfc3f2223, "sw\tgp,-60(t5)"],
  ["add", 0x8000004c, 0xff1ff06f, "j\t8000003c"],
  ["add", 0x800000dc, 0x30529073, "csrw\tmtvec,t0"],
  ["add", 0x800000e0, 0x74445073, "csrw\t0x744,8"],
  ["add", 0x800000f0, 0x18005073, "csrw\tsatp,0"],
  ["add", 0x80000100, 0x800002b7, "lui\tt0,0x80000"],
  ["add", 0x80000148, 0x0ff0000f, "fence"],
  ["srai", 0x800001e8, 0x41f6d713, "sra\ta4,a3,0x1f"],
  ["sw", 0x8000028c, 0xff412703, "lw\ta4,-12(sp)"],
  ["jalr", 0x8000019c, 0x000302e7, "jalr\tt0,t1"],
  ["jalr", 0x80000258, 0xffc30067, "jr\t-4(t1)"],
  ["add", 0x8000069c, 0xc0001073, "unimp"],
  ["lw", 0x8000200c, 0xf00ff00f, ".4byte\t0xf00ff00f"],
  ["lh", 0x80002006, 0x0000f00f, ".4byte\t0xf00f"],
  ["jal", 0x80000194, 0x0100026f, "jal\ttp,800001a4"],
] as const;

describe("GNU objdump disassembly", () => {
  it.each(objdumpTable)("matches objdump from %s at %i", (source, pc, word, expected) => {
    const dump = readFileSync(
      new URL(`../fixtures/riscv-tests/rv32ui-p-${source}.dump`, import.meta.url),
      "utf8",
    );
    const line = dump.split("\n").find((line) => line.startsWith(`${pc.toString(16)}:`));
    expect(line).toBeDefined();
    const columns = line!.trim().split(/\s+/);
    expect(columns[1]).toBe(word.toString(16).padStart(8, "0"));
    const assembly = columns
      .slice(2)
      .join("\t")
      .split(/\t[<#]/)[0];
    expect(assembly).toBe(expected);
    expect(disassemble(word, pc)).toBe(expected);
  });
});
