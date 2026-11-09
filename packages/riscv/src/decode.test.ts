import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { decode, type Instruction } from "./index.js";
import * as f from "./fields.js";
import { encodeR, encodeI, encodeS, encodeB, encodeU, encodeJ } from "./encoding.test-support.js";

// Fixed words, independent of the property-test encoders. Operands are rd=a0, rs1=a1,
// rs2=a2 where applicable; signed immediates are -4, and shift amounts are 31.
const known: readonly (readonly [number, Instruction])[] = [
  [0xffffc537, { op: "lui", rd: 10, imm: -16384 }],
  [0xffffc517, { op: "auipc", rd: 10, imm: -16384 }],
  [0xffdff56f, { op: "jal", rd: 10, imm: -4 }],
  [0xffc58567, { op: "jalr", rd: 10, rs1: 11, imm: -4 }],
  [0xfec58ee3, { op: "beq", rs1: 11, rs2: 12, imm: -4 }],
  [0xfec59ee3, { op: "bne", rs1: 11, rs2: 12, imm: -4 }],
  [0xfec5cee3, { op: "blt", rs1: 11, rs2: 12, imm: -4 }],
  [0xfec5dee3, { op: "bge", rs1: 11, rs2: 12, imm: -4 }],
  [0xfec5eee3, { op: "bltu", rs1: 11, rs2: 12, imm: -4 }],
  [0xfec5fee3, { op: "bgeu", rs1: 11, rs2: 12, imm: -4 }],
  [0xffc58503, { op: "lb", rd: 10, rs1: 11, imm: -4 }],
  [0xffc59503, { op: "lh", rd: 10, rs1: 11, imm: -4 }],
  [0xffc5a503, { op: "lw", rd: 10, rs1: 11, imm: -4 }],
  [0xffc5c503, { op: "lbu", rd: 10, rs1: 11, imm: -4 }],
  [0xffc5d503, { op: "lhu", rd: 10, rs1: 11, imm: -4 }],
  [0xfec58e23, { op: "sb", rs1: 11, rs2: 12, imm: -4 }],
  [0xfec59e23, { op: "sh", rs1: 11, rs2: 12, imm: -4 }],
  [0xfec5ae23, { op: "sw", rs1: 11, rs2: 12, imm: -4 }],
  [0xffc58513, { op: "addi", rd: 10, rs1: 11, imm: -4 }],
  [0xffc5a513, { op: "slti", rd: 10, rs1: 11, imm: -4 }],
  [0xffc5b513, { op: "sltiu", rd: 10, rs1: 11, imm: -4 }],
  [0xffc5c513, { op: "xori", rd: 10, rs1: 11, imm: -4 }],
  [0xffc5e513, { op: "ori", rd: 10, rs1: 11, imm: -4 }],
  [0xffc5f513, { op: "andi", rd: 10, rs1: 11, imm: -4 }],
  [0x01f59513, { op: "slli", rd: 10, rs1: 11, shamt: 31 }],
  [0x01f5d513, { op: "srli", rd: 10, rs1: 11, shamt: 31 }],
  [0x41f5d513, { op: "srai", rd: 10, rs1: 11, shamt: 31 }],
  [0x00c58533, { op: "add", rd: 10, rs1: 11, rs2: 12 }],
  [0x40c58533, { op: "sub", rd: 10, rs1: 11, rs2: 12 }],
  [0x00c59533, { op: "sll", rd: 10, rs1: 11, rs2: 12 }],
  [0x00c5a533, { op: "slt", rd: 10, rs1: 11, rs2: 12 }],
  [0x00c5b533, { op: "sltu", rd: 10, rs1: 11, rs2: 12 }],
  [0x00c5c533, { op: "xor", rd: 10, rs1: 11, rs2: 12 }],
  [0x00c5d533, { op: "srl", rd: 10, rs1: 11, rs2: 12 }],
  [0x40c5d533, { op: "sra", rd: 10, rs1: 11, rs2: 12 }],
  [0x00c5e533, { op: "or", rd: 10, rs1: 11, rs2: 12 }],
  [0x00c5f533, { op: "and", rd: 10, rs1: 11, rs2: 12 }],
  [0x0a50000f, { op: "fence", pred: 10, succ: 5 }],
  [0x0000100f, { op: "fence.i" }],
  [0x00000073, { op: "ecall" }],
  [0x00100073, { op: "ebreak" }],
  [0x30200073, { op: "mret" }],
  [0x10500073, { op: "wfi" }],
  [0x30059573, { op: "csrrw", rd: 10, rs1: 11, csr: 0x300 }],
  [0x3005a573, { op: "csrrs", rd: 10, rs1: 11, csr: 0x300 }],
  [0x3005b573, { op: "csrrc", rd: 10, rs1: 11, csr: 0x300 }],
  [0xfffdd573, { op: "csrrwi", rd: 10, imm: 27, csr: 0xfff }],
  [0xfffde573, { op: "csrrsi", rd: 10, imm: 27, csr: 0xfff }],
  [0xfffdf573, { op: "csrrci", rd: 10, imm: 27, csr: 0xfff }],
];

describe("decode", () => {
  it.each(known)("decodes word %i as %j", (word, instruction) => {
    expect(decode(word)).toEqual(instruction);
    expect(decode(word | 0)).toEqual(instruction);
  });

  it.each([
    0,
    0xffffffff,
    0x0000007b,
    0x02058533,
    0x20058533, // unknown opcodes and M/reserved funct7
    0x40c59533,
    0x40c5a533,
    0x40c5b533,
    0x40c5c533,
    0x40c5e533,
    0x40c5f533,
    0x43f5d513,
    0x03f59513,
    0x41f59513,
    0x03f5d513, // RV64/reserved shifts
    0x00001067,
    0x00002063,
    0x00003063,
    0x00003003,
    0x00006003,
    0x00007003,
    0x00003023,
    0x00004023,
    0x00005023,
    0x00006023,
    0x00007023,
    0x0000200f,
    0x00004073,
    0x00200073,
    0x10200073,
    0x302000f3,
    0x10508073,
  ])("rejects reserved or unsupported word %i", (word) => {
    expect(decode(word)).toEqual({ op: "illegal", word: word >>> 0 });
  });

  it("ignores fence fields reserved for future finer-grained fences", () => {
    expect(decode(0xfaa5850f)).toEqual({ op: "fence", pred: 10, succ: 10 });
    expect(decode(0xfff5950f)).toEqual({ op: "fence.i" });
  });

  const register = fc.integer({ min: 0, max: 31 });
  it("round-trips generated operands for every instruction format", () => {
    fc.assert(
      fc.property(
        register,
        register,
        register,
        fc.integer({ min: -2048, max: 2047 }),
        fc.integer({ min: -2048, max: 2047 }),
        fc.integer({ min: -524288, max: 524287 }),
        fc.integer({ min: 0, max: 0xfffff }),
        fc.integer({ min: 0, max: 4095 }),
        (rd, rs1, rs2, imm, branchHalf, jumpHalf, upper, csr) => {
          for (const [funct3, op] of [
            "add",
            "sll",
            "slt",
            "sltu",
            "xor",
            "srl",
            "or",
            "and",
          ].entries()) {
            expect(decode(encodeR(0x33, funct3, 0, rd, rs1, rs2))).toEqual({ op, rd, rs1, rs2 });
          }
          for (const [funct3, op] of [
            [0, "sub"],
            [5, "sra"],
          ] as const) {
            expect(decode(encodeR(0x33, funct3, 32, rd, rs1, rs2))).toEqual({ op, rd, rs1, rs2 });
          }
          for (const [funct3, op] of [
            [0, "addi"],
            [2, "slti"],
            [3, "sltiu"],
            [4, "xori"],
            [6, "ori"],
            [7, "andi"],
          ] as const) {
            expect(decode(encodeI(0x13, funct3, rd, rs1, imm))).toEqual({ op, rd, rs1, imm });
          }
          for (const [funct3, op] of [
            [0, "lb"],
            [1, "lh"],
            [2, "lw"],
            [4, "lbu"],
            [5, "lhu"],
          ] as const) {
            expect(decode(encodeI(3, funct3, rd, rs1, imm))).toEqual({ op, rd, rs1, imm });
          }
          expect(decode(encodeI(0x67, 0, rd, rs1, imm))).toEqual({ op: "jalr", rd, rs1, imm });
          for (const [funct3, op] of ["sb", "sh", "sw"].entries()) {
            expect(decode(encodeS(funct3, rs1, rs2, imm))).toEqual({ op, rs1, rs2, imm });
          }
          for (const [funct3, op] of [
            [0, "beq"],
            [1, "bne"],
            [4, "blt"],
            [5, "bge"],
            [6, "bltu"],
            [7, "bgeu"],
          ] as const) {
            expect(decode(encodeB(funct3, rs1, rs2, branchHalf * 2))).toEqual({
              op,
              rs1,
              rs2,
              imm: branchHalf * 2,
            });
          }
          for (const [major, op] of [
            [0x37, "lui"],
            [0x17, "auipc"],
          ] as const) {
            expect(decode(encodeU(major, rd, upper << 12))).toEqual({ op, rd, imm: upper << 12 });
          }
          expect(decode(encodeJ(rd, jumpHalf * 2))).toEqual({ op: "jal", rd, imm: jumpHalf * 2 });
          for (const [funct3, high, op] of [
            [1, 0, "slli"],
            [5, 0, "srli"],
            [5, 0x400, "srai"],
          ] as const) {
            expect(decode(encodeI(0x13, funct3, rd, rs1, high + rs2))).toEqual({
              op,
              rd,
              rs1,
              shamt: rs2,
            });
          }
          for (const [funct3, op] of [
            [1, "csrrw"],
            [2, "csrrs"],
            [3, "csrrc"],
          ] as const) {
            expect(decode(encodeI(0x73, funct3, rd, rs1, csr))).toEqual({ op, rd, rs1, csr });
          }
          for (const [funct3, op] of [
            [5, "csrrwi"],
            [6, "csrrsi"],
            [7, "csrrci"],
          ] as const) {
            expect(decode(encodeI(0x73, funct3, rd, rs1, csr))).toEqual({ op, rd, imm: rs1, csr });
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("extracts fields independently for an executor", () => {
    const word = 0xfffdf573;
    expect([
      f.opcode(word),
      f.rd(word),
      f.funct3(word),
      f.rs1(word),
      f.rs2(word),
      f.funct7(word),
      f.csr(word),
      f.shamt(word),
    ]).toEqual([0x73, 10, 7, 27, 31, 127, 4095, 31]);
    expect([f.pred(0x0a50000f), f.succ(0x0a50000f)]).toEqual([10, 5]);
  });
});
