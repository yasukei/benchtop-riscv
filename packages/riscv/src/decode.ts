import * as f from "./fields.js";
import type { Instruction } from "./instruction.js";

const branches = ["beq", "bne", undefined, undefined, "blt", "bge", "bltu", "bgeu"] as const;
const loads = ["lb", "lh", "lw", undefined, "lbu", "lhu"] as const;
const stores = ["sb", "sh", "sw"] as const;
const immediates = ["addi", undefined, "slti", "sltiu", "xori", undefined, "ori", "andi"] as const;
const registers = ["add", "sll", "slt", "sltu", "xor", "srl", "or", "and"] as const;
const csrRegisters = [undefined, "csrrw", "csrrs", "csrrc"] as const;
const csrImmediates = ["csrrwi", "csrrsi", "csrrci"] as const;

/** Decode an RV32I/Zicsr/Zifencei instruction, or preserve an unsupported word as u32. */
export function decode(word: number): Instruction {
  word >>>= 0;
  const rd = f.rd(word);
  const rs1 = f.rs1(word);
  const rs2 = f.rs2(word);
  const funct3 = f.funct3(word);
  const funct7 = f.funct7(word);
  switch (f.opcode(word)) {
    case 0x37:
      return { op: "lui", rd, imm: f.immU(word) };
    case 0x17:
      return { op: "auipc", rd, imm: f.immU(word) };
    case 0x6f:
      return { op: "jal", rd, imm: f.immJ(word) };
    case 0x67:
      if (funct3 === 0) return { op: "jalr", rd, rs1, imm: f.immI(word) };
      break;
    case 0x63: {
      const op = branches[funct3];
      if (op !== undefined) return { op, rs1, rs2, imm: f.immB(word) };
      break;
    }
    case 0x03: {
      const op = loads[funct3];
      if (op !== undefined) return { op, rd, rs1, imm: f.immI(word) };
      break;
    }
    case 0x23: {
      const op = stores[funct3];
      if (op !== undefined) return { op, rs1, rs2, imm: f.immS(word) };
      break;
    }
    case 0x13: {
      if (funct3 === 1 && funct7 === 0) return { op: "slli", rd, rs1, shamt: rs2 };
      if (funct3 === 5 && (funct7 === 0 || funct7 === 0x20)) {
        return { op: funct7 === 0 ? "srli" : "srai", rd, rs1, shamt: rs2 };
      }
      const op = immediates[funct3];
      if (op !== undefined) return { op, rd, rs1, imm: f.immI(word) };
      break;
    }
    case 0x33: {
      if (funct7 === 0x20 && (funct3 === 0 || funct3 === 5)) {
        return { op: funct3 === 0 ? "sub" : "sra", rd, rs1, rs2 };
      }
      if (funct7 === 0) {
        const op = registers[funct3]!;
        return { op, rd, rs1, rs2 };
      }
      break;
    }
    case 0x0f:
      // The ISA requires base implementations to ignore reserved rd/rs1/fm fields.
      if (funct3 === 0) return { op: "fence", pred: f.pred(word), succ: f.succ(word) };
      // Zifencei likewise ignores its reserved immediate, rd and rs1 fields.
      if (funct3 === 1) return { op: "fence.i" };
      break;
    case 0x73: {
      if (word === 0x00000073) return { op: "ecall" };
      if (word === 0x00100073) return { op: "ebreak" };
      if (word === 0x30200073) return { op: "mret" };
      if (word === 0x10500073) return { op: "wfi" };
      const csr = f.csr(word);
      const registerOp = csrRegisters[funct3];
      if (registerOp !== undefined) return { op: registerOp, rd, rs1, csr };
      const immediateOp = csrImmediates[funct3 - 5];
      if (immediateOp !== undefined) return { op: immediateOp, rd, imm: rs1, csr };
      break;
    }
  }
  return { op: "illegal", word };
}
