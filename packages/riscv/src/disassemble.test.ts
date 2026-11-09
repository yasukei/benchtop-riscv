import { describe, expect, it } from "vitest";
import { disassemble } from "./index.js";
import { encodeI } from "./encoding.test-support.js";

describe("disassemble", () => {
  it.each([
    [0x00000013, "nop"],
    [0x00058513, "mv\ta0,a1"],
    [0xffc58513, "add\ta0,a1,-4"],
    [0xffc5a513, "slti\ta0,a1,-4"],
    [0xffc5b513, "sltiu\ta0,a1,-4"],
    [0xffc5c513, "xor\ta0,a1,-4"],
    [0xffc5f513, "and\ta0,a1,-4"],
    [0xfff5c513, "not\ta0,a1"],
    [0x0015b513, "seqz\ta0,a1"],
    [0x40b00533, "neg\ta0,a1"],
    [0x00b03533, "snez\ta0,a1"],
    [0x0005a533, "sltz\ta0,a1"],
    [0x00b02533, "sgtz\ta0,a1"],
    [0x00c58533, "add\ta0,a1,a2"],
    [0x40c58533, "sub\ta0,a1,a2"],
    [0x00c5b533, "sltu\ta0,a1,a2"],
    [0x00c5a533, "slt\ta0,a1,a2"],
    [0x01f59513, "sll\ta0,a1,0x1f"],
    [0x01f5d513, "srl\ta0,a1,0x1f"],
    [0xffffc537, "lui\ta0,0xffffc"],
    [0xffc58503, "lb\ta0,-4(a1)"],
    [0xffc59503, "lh\ta0,-4(a1)"],
    [0xffc5c503, "lbu\ta0,-4(a1)"],
    [0xffc5d503, "lhu\ta0,-4(a1)"],
    [0xfec58e23, "sb\ta2,-4(a1)"],
    [0xfec59e23, "sh\ta2,-4(a1)"],
    [0x00008067, "ret"],
    [0x000580e7, "jalr\ta1"],
    [0xffc580e7, "jalr\t-4(a1)"],
    [0xffc58567, "jalr\ta0,-4(a1)"],
    [0xffdff0ef, "jal\t-4"],
    [0xffdff56f, "jal\ta0,-4"],
    [0xfec59ee3, "bne\ta1,a2,-4"],
    [0xfec5cee3, "blt\ta1,a2,-4"],
    [0xfec5dee3, "bge\ta1,a2,-4"],
    [0xfec5eee3, "bltu\ta1,a2,-4"],
    [0xfec5fee3, "bgeu\ta1,a2,-4"],
    [0x00059063, "bnez\ta1,0"],
    [0x0005c063, "bltz\ta1,0"],
    [0x00b04063, "bgtz\ta1,0"],
    [0x00b05063, "blez\ta1,0"],
    [0x0a50000f, "fence\tir,ow"],
    [0x0000000f, "fence\tunknown,unknown"],
    [0x0000100f, "fence.i"],
    [0x00000073, "ecall"],
    [0x00100073, "ebreak"],
    [0x30200073, "mret"],
    [0x10500073, "wfi"],
    [0x30059573, "csrrw\ta0,mstatus,a1"],
    [0x3005a573, "csrrs\ta0,mstatus,a1"],
    [0x3005b573, "csrrc\ta0,mstatus,a1"],
    [0x30059073, "csrw\tmstatus,a1"],
    [0x3005a073, "csrs\tmstatus,a1"],
    [0x3005b073, "csrc\tmstatus,a1"],
    [0xfffdd573, "csrrwi\ta0,0xfff,27"],
    [0xfffde573, "csrrsi\ta0,0xfff,27"],
    [0xfffdf573, "csrrci\ta0,0xfff,27"],
    [0x3005e073, "csrs\tmstatus,11"],
    [0x3005f073, "csrc\tmstatus,11"],
    [0x30006573, "csrr\ta0,mstatus"],
    [0x00000000, ".word\t0x00000000"],
    [-1, ".word\t0xffffffff"],
  ] as const)("formats word %i", (word, expected) => {
    expect(disassemble(word)).toBe(expected);
  });

  it("wraps absolute jump and branch targets to the RV32 address space", () => {
    expect(disassemble(0xffdff56f, 0)).toBe("jal\ta0,fffffffc");
    expect(disassemble(0x0040006f, 0xfffffffc)).toBe("j\t0");
    expect(disassemble(0xfec58ee3, 0)).toBe("beq\ta1,a2,fffffffc");
    expect(disassemble(0x000f0463, 0xfffffffc)).toBe("beqz\tt5,4");
  });

  it("names every ABI register", () => {
    const names =
      "zero ra sp gp tp t0 t1 t2 s0 s1 a0 a1 a2 a3 a4 a5 a6 a7 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 t3 t4 t5 t6".split(
        " ",
      );
    names.forEach((name, index) =>
      expect(disassemble(encodeI(3, 2, index, 0, 4))).toBe(`lw\t${name},4(zero)`),
    );
  });
});
