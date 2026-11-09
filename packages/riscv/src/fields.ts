/** Allocation-free field extraction for RV32 instruction words. */
export const opcode = (word: number): number => word & 0x7f;
export const rd = (word: number): number => (word >>> 7) & 0x1f;
export const funct3 = (word: number): number => (word >>> 12) & 7;
export const rs1 = (word: number): number => (word >>> 15) & 0x1f;
export const rs2 = (word: number): number => (word >>> 20) & 0x1f;
export const funct7 = (word: number): number => word >>> 25;
export const csr = (word: number): number => word >>> 20;
export const shamt = rs2;
export const pred = (word: number): number => (word >>> 24) & 0xf;
export const succ = (word: number): number => (word >>> 20) & 0xf;

export const immI = (word: number): number => word >> 20;
export const immS = (word: number): number => ((word >> 25) << 5) | ((word >>> 7) & 0x1f);
export const immB = (word: number): number =>
  ((word >> 31) << 12) |
  (((word >>> 7) & 1) << 11) |
  (((word >>> 25) & 0x3f) << 5) |
  (((word >>> 8) & 0xf) << 1);
/** U immediates include the low twelve zero bits and are signed int32 values. */
export const immU = (word: number): number => word & 0xfffff000;
export const immJ = (word: number): number =>
  ((word >> 31) << 20) |
  (((word >>> 12) & 0xff) << 12) |
  (((word >>> 20) & 1) << 11) |
  (((word >>> 21) & 0x3ff) << 1);
