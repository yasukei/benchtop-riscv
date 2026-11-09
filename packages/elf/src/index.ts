/** Stable package identity. */
export const packageName = "@benchtop-riscv/elf";

export { ElfError, findSymbol, parseElf } from "./elf.js";
export type { ElfErrorCode, ElfFile, ElfSegment, ElfSymbol } from "./elf.js";
