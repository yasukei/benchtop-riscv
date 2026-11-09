/** Stable categories for rejected ELF files. */
export type ElfErrorCode =
  | "bad-magic"
  | "not-elf32"
  | "not-little-endian"
  | "not-riscv"
  | "not-executable"
  | "truncated"
  | "invalid-header"
  | "invalid-segment"
  | "invalid-symbol-table";

export class ElfError extends Error {
  constructor(
    readonly code: ElfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ElfError";
  }
}

export interface ElfSegment {
  readonly paddr: number;
  readonly vaddr: number;
  /** View into the input bytes; zero-fill up to memSize when loading into RAM. */
  readonly fileBytes: Uint8Array;
  readonly memSize: number;
  readonly flags: number;
}

export interface ElfSymbol {
  readonly name: string;
  readonly value: number;
  readonly size: number;
  readonly type: number;
  readonly binding: number;
}

export interface ElfFile {
  readonly entry: number;
  readonly flags: number;
  readonly segments: readonly ElfSegment[];
  /** All SHT_SYMTAB entries, including the null symbol; empty for stripped files. */
  readonly symbols: readonly ElfSymbol[];
}

interface Section {
  type: number;
  offset: number;
  size: number;
  link: number;
  entrySize: number;
}

/** Parse an ELF32 little-endian RISC-V executable without copying segment data. */
export function parseElf(bytes: Uint8Array): ElfFile {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  const checkRange = (offset: number, size: number, label: string) => {
    // Use ordinary number arithmetic: wrapping to u32 could hide an invalid range.
    if (offset + size > bytes.length) {
      throw new ElfError("truncated", `${label} extends beyond the file`);
    }
  };

  checkRange(0, 52, "ELF header");
  if (u32(0) !== 0x464c457f) throw new ElfError("bad-magic", "Missing ELF magic");
  if (bytes[4] !== 1) throw new ElfError("not-elf32", "Expected ELFCLASS32");
  if (bytes[5] !== 1) throw new ElfError("not-little-endian", "Expected ELFDATA2LSB");
  if (u16(18) !== 243) throw new ElfError("not-riscv", "Expected EM_RISCV (243)");
  if (u16(16) !== 2) throw new ElfError("not-executable", "Expected ET_EXEC");
  if (bytes[6] !== 1 || u32(20) !== 1 || u16(40) < 52) {
    throw new ElfError("invalid-header", "Invalid ELF version or header size");
  }
  checkRange(0, u16(40), "ELF header");

  const phoff = u32(28);
  const shoff = u32(32);
  const phentsize = u16(42);
  const shentsize = u16(46);
  let phnum = u16(44);
  let shnum = u16(48);
  // ELF extended counts are stored in section header zero.
  if ((shnum === 0 && shoff !== 0) || phnum === 0xffff) {
    if (shoff === 0 || shentsize < 40) {
      throw new ElfError("invalid-header", "Extended counts need section header zero");
    }
    checkRange(shoff, shentsize, "Section header zero");
    if (shnum === 0) shnum = u32(shoff + 20);
    if (phnum === 0xffff) phnum = u32(shoff + 28);
  }
  if ((phnum > 0 && phentsize < 32) || (shnum > 0 && shentsize < 40)) {
    throw new ElfError("invalid-header", "Header table entry size is too small");
  }
  if ((phnum > 0 && phoff === 0) || (shnum > 0 && shoff === 0)) {
    throw new ElfError("invalid-header", "Header table offset is missing");
  }
  if (phnum > 0) checkRange(phoff, phnum * phentsize, "Program header table");
  if (shnum > 0) checkRange(shoff, shnum * shentsize, "Section header table");

  const segments: ElfSegment[] = [];
  for (let i = 0; i < phnum; i++) {
    const header = phoff + i * phentsize;
    const offset = u32(header + 4);
    const fileSize = u32(header + 16);
    const memSize = u32(header + 20);
    checkRange(offset, fileSize, `Segment ${i}`);
    if (u32(header) !== 1) continue; // PT_LOAD only.
    if (fileSize > memSize) {
      throw new ElfError("invalid-segment", `Segment ${i} file size exceeds memory size`);
    }
    segments.push({
      paddr: u32(header + 12),
      vaddr: u32(header + 8),
      fileBytes: bytes.subarray(offset, offset + fileSize),
      memSize,
      flags: u32(header + 24),
    });
  }

  const sections: Section[] = [];
  for (let i = 0; i < shnum; i++) {
    const header = shoff + i * shentsize;
    const section = {
      type: u32(header + 4),
      offset: u32(header + 16),
      size: u32(header + 20),
      link: u32(header + 24),
      entrySize: u32(header + 36),
    };
    // SHT_NULL has no contents (its fields can encode extended counts), and
    // SHT_NOBITS describes memory such as .bss without occupying file bytes.
    if (section.type !== 0 && section.type !== 8) {
      checkRange(section.offset, section.size, `Section ${i}`);
    }
    sections.push(section);
  }

  const symbols: ElfSymbol[] = [];
  for (const section of sections) {
    if (section.type !== 2) continue; // SHT_SYMTAB, not SHT_DYNSYM.
    const strings = sections[section.link];
    if (section.entrySize < 16 || section.size % section.entrySize !== 0 || strings?.type !== 3) {
      throw new ElfError("invalid-symbol-table", "Invalid symbol entries or linked string table");
    }
    for (
      let offset = section.offset;
      offset < section.offset + section.size;
      offset += section.entrySize
    ) {
      const nameOffset = u32(offset);
      if (nameOffset >= strings.size) {
        throw new ElfError("invalid-symbol-table", "Symbol name is outside its string table");
      }
      let cursor = strings.offset + nameOffset;
      const end = strings.offset + strings.size;
      let name = "";
      while (cursor < end && bytes[cursor] !== 0) name += String.fromCharCode(bytes[cursor++]!);
      if (cursor === end) {
        throw new ElfError("invalid-symbol-table", "Symbol name is not null-terminated");
      }
      const info = view.getUint8(offset + 12);
      symbols.push({
        name,
        value: u32(offset + 4),
        size: u32(offset + 8),
        type: info & 15,
        binding: info >>> 4,
      });
    }
  }

  return { entry: u32(24), flags: u32(36), segments, symbols };
}

export function findSymbol(file: ElfFile, name: string): ElfSymbol | undefined {
  return file.symbols.find((symbol) => symbol.name === name);
}
