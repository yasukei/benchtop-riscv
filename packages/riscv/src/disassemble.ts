import { decode } from "./decode.js";

const registers = [
  "zero",
  "ra",
  "sp",
  "gp",
  "tp",
  "t0",
  "t1",
  "t2",
  "s0",
  "s1",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
  "s11",
  "t3",
  "t4",
  "t5",
  "t6",
] as const;
const reg = (index: number): string => registers[index]!;
const hex = (value: number): string => (value >>> 0).toString(16);
const csrNames: Readonly<Record<number, string>> = {
  0x100: "sstatus",
  0x104: "sie",
  0x105: "stvec",
  0x140: "sscratch",
  0x141: "sepc",
  0x142: "scause",
  0x143: "stval",
  0x144: "sip",
  0x180: "satp",
  0x300: "mstatus",
  0x301: "misa",
  0x302: "medeleg",
  0x303: "mideleg",
  0x304: "mie",
  0x305: "mtvec",
  0x306: "mcounteren",
  0x340: "mscratch",
  0x341: "mepc",
  0x342: "mcause",
  0x343: "mtval",
  0x344: "mip",
  0x3a0: "pmpcfg0",
  0x3b0: "pmpaddr0",
  0xb00: "mcycle",
  0xb02: "minstret",
  0xb80: "mcycleh",
  0xb82: "minstreth",
  0xc00: "cycle",
  0xc01: "time",
  0xc02: "instret",
  0xc80: "cycleh",
  0xc81: "timeh",
  0xc82: "instreth",
  0xf11: "mvendorid",
  0xf12: "marchid",
  0xf13: "mimpid",
  0xf14: "mhartid",
};
const fenceMask = (mask: number): string =>
  ["i", "o", "r", "w"].filter((_, index) => mask & (8 >> index)).join("") || "unknown";

/** GNU objdump-style assembly, without its address/word columns or symbol annotations.
 * Branch/jump immediates are signed decimal offsets without pc, otherwise wrapped u32 hex targets.
 * Common default aliases are emitted; unlisted aliases and CSR names retain their base spelling.
 */
export function disassemble(word: number, pc?: number): string {
  const i = decode(word);
  const target = (offset: number): string => (pc === undefined ? `${offset}` : hex(pc + offset));
  switch (i.op) {
    case "illegal":
      return `.4byte\t0x${hex(i.word)}`;
    case "lui":
    case "auipc":
      return `${i.op}\t${reg(i.rd)},0x${hex(i.imm >>> 12)}`;
    case "jal":
      if (i.rd === 0) return `j\t${target(i.imm)}`;
      if (i.rd === 1) return `jal\t${target(i.imm)}`;
      return `jal\t${reg(i.rd)},${target(i.imm)}`;
    case "jalr":
      if (i.imm === 0) {
        if (i.rd === 0 && i.rs1 === 1) return "ret";
        if (i.rd === 0) return `jr\t${reg(i.rs1)}`;
        if (i.rd === 1) return `jalr\t${reg(i.rs1)}`;
        return `jalr\t${reg(i.rd)},${reg(i.rs1)}`;
      }
      if (i.rd === 0) return `jr\t${i.imm}(${reg(i.rs1)})`;
      if (i.rd === 1) return `jalr\t${i.imm}(${reg(i.rs1)})`;
      return `${i.op}\t${reg(i.rd)},${i.imm}(${reg(i.rs1)})`;
    case "beq":
    case "bne":
    case "blt":
    case "bge":
    case "bltu":
    case "bgeu": {
      if (i.rs2 === 0 && (i.op === "beq" || i.op === "bne" || i.op === "blt" || i.op === "bge")) {
        return `${i.op}z\t${reg(i.rs1)},${target(i.imm)}`;
      }
      if (i.rs1 === 0 && (i.op === "blt" || i.op === "bge")) {
        return `${i.op === "blt" ? "bgtz" : "blez"}\t${reg(i.rs2)},${target(i.imm)}`;
      }
      return `${i.op}\t${reg(i.rs1)},${reg(i.rs2)},${target(i.imm)}`;
    }
    case "lb":
    case "lh":
    case "lw":
    case "lbu":
    case "lhu":
      return `${i.op}\t${reg(i.rd)},${i.imm}(${reg(i.rs1)})`;
    case "sb":
    case "sh":
    case "sw":
      return `${i.op}\t${reg(i.rs2)},${i.imm}(${reg(i.rs1)})`;
    case "addi":
      if (i.rd === 0 && i.rs1 === 0 && i.imm === 0) return "nop";
      if (i.rs1 === 0) return `li\t${reg(i.rd)},${i.imm}`;
      if (i.imm === 0) return `mv\t${reg(i.rd)},${reg(i.rs1)}`;
      return `add\t${reg(i.rd)},${reg(i.rs1)},${i.imm}`;
    case "sltiu":
      if (i.imm === 1) return `seqz\t${reg(i.rd)},${reg(i.rs1)}`;
      return `${i.op}\t${reg(i.rd)},${reg(i.rs1)},${i.imm}`;
    case "xori":
      if (i.imm === -1) return `not\t${reg(i.rd)},${reg(i.rs1)}`;
      return `xor\t${reg(i.rd)},${reg(i.rs1)},${i.imm}`;
    case "ori":
    case "andi":
      return `${i.op === "ori" ? "or" : "and"}\t${reg(i.rd)},${reg(i.rs1)},${i.imm}`;
    case "slti":
      return `${i.op}\t${reg(i.rd)},${reg(i.rs1)},${i.imm}`;
    case "slli":
    case "srli":
    case "srai":
      return `${i.op.slice(0, -1)}\t${reg(i.rd)},${reg(i.rs1)},0x${hex(i.shamt)}`;
    case "sub":
      if (i.rs1 === 0) return `neg\t${reg(i.rd)},${reg(i.rs2)}`;
      return `${i.op}\t${reg(i.rd)},${reg(i.rs1)},${reg(i.rs2)}`;
    case "slt":
      if (i.rs2 === 0) return `sltz\t${reg(i.rd)},${reg(i.rs1)}`;
      if (i.rs1 === 0) return `sgtz\t${reg(i.rd)},${reg(i.rs2)}`;
      return `${i.op}\t${reg(i.rd)},${reg(i.rs1)},${reg(i.rs2)}`;
    case "sltu":
      if (i.rs1 === 0) return `snez\t${reg(i.rd)},${reg(i.rs2)}`;
      return `${i.op}\t${reg(i.rd)},${reg(i.rs1)},${reg(i.rs2)}`;
    case "add":
    case "sll":
    case "xor":
    case "srl":
    case "sra":
    case "or":
    case "and":
      return `${i.op}\t${reg(i.rd)},${reg(i.rs1)},${reg(i.rs2)}`;
    case "fence":
      return i.pred === 15 && i.succ === 15
        ? "fence"
        : `fence\t${fenceMask(i.pred)},${fenceMask(i.succ)}`;
    case "fence.i":
    case "ecall":
    case "ebreak":
    case "mret":
    case "wfi":
      return i.op;
    case "csrrw":
    case "csrrs":
    case "csrrc":
    case "csrrwi":
    case "csrrsi":
    case "csrrci": {
      if (i.op === "csrrw" && i.rd === 0 && i.rs1 === 0 && i.csr === 0xc00) return "unimp";
      const csr = csrNames[i.csr] ?? `0x${hex(i.csr)}`;
      const source = "rs1" in i ? reg(i.rs1) : `${i.imm}`;
      if (i.op === "csrrs" && i.rs1 === 0) {
        if ((i.csr >= 0xc00 && i.csr <= 0xc02) || (i.csr >= 0xc80 && i.csr <= 0xc82)) {
          return `rd${csr}\t${reg(i.rd)}`;
        }
        return `csrr\t${reg(i.rd)},${csr}`;
      }
      if (i.rd === 0) {
        const alias = {
          csrrw: "csrw",
          csrrs: "csrs",
          csrrc: "csrc",
          csrrwi: "csrw",
          csrrsi: "csrs",
          csrrci: "csrc",
        }[i.op];
        return `${alias}\t${csr},${source}`;
      }
      // GNU objdump 2.40 overloads the register mnemonics for immediate CSR sources.
      const mnemonic = "imm" in i ? i.op.slice(0, -1) : i.op;
      return `${mnemonic}\t${reg(i.rd)},${csr},${source}`;
    }
  }
}
