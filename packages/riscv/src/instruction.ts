/** Distribute operand shapes over mnemonics, preserving exhaustive narrowing by op. */
type Forms<Op extends string, Operands = object> = {
  [Name in Op]: { op: Name } & Operands;
}[Op];

export type Instruction =
  | Forms<"lui" | "auipc" | "jal", { rd: number; imm: number }>
  | Forms<"jalr" | "lb" | "lh" | "lw" | "lbu" | "lhu", { rd: number; rs1: number; imm: number }>
  | Forms<
      "beq" | "bne" | "blt" | "bge" | "bltu" | "bgeu",
      { rs1: number; rs2: number; imm: number }
    >
  | Forms<"sb" | "sh" | "sw", { rs1: number; rs2: number; imm: number }>
  | Forms<
      "addi" | "slti" | "sltiu" | "xori" | "ori" | "andi",
      { rd: number; rs1: number; imm: number }
    >
  | Forms<"slli" | "srli" | "srai", { rd: number; rs1: number; shamt: number }>
  | Forms<
      "add" | "sub" | "sll" | "slt" | "sltu" | "xor" | "srl" | "sra" | "or" | "and",
      { rd: number; rs1: number; rs2: number }
    >
  | Forms<"fence", { pred: number; succ: number }>
  | Forms<"fence.i" | "ecall" | "ebreak" | "mret" | "wfi">
  | Forms<"csrrw" | "csrrs" | "csrrc", { rd: number; rs1: number; csr: number }>
  // The immediate CSR source is an unsigned five-bit value, not a sign-extended I immediate.
  | Forms<"csrrwi" | "csrrsi" | "csrrci", { rd: number; imm: number; csr: number }>
  | Forms<"illegal", { word: number }>;
