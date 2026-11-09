/** Stable package identity. */
export const packageName = "@benchtop-riscv/riscv";

export { decode } from "./decode.js";
export { disassemble } from "./disassemble.js";
export type { Instruction } from "./instruction.js";
export {
  opcode,
  rd,
  funct3,
  rs1,
  rs2,
  funct7,
  csr,
  shamt,
  pred,
  succ,
  immI,
  immS,
  immB,
  immU,
  immJ,
} from "./fields.js";
export { Hart } from "./hart.js";
