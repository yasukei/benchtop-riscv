import { describe, expect, it } from "vitest";
import { ElfError, findSymbol, parseElf } from "./index.js";
import type { ElfErrorCode } from "./index.js";

// A complete synthetic ELF, including a non-loadable program header and a .bss
// section whose memory size deliberately extends beyond the end of the file.
function makeElf() {
  const bytes = new Uint8Array(512);
  const view = new DataView(bytes.buffer);
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1]);
  u16(16, 2); // ET_EXEC
  u16(18, 243); // EM_RISCV
  u32(20, 1);
  u32(24, 0x8000_0000);
  u32(28, 52); // Program header table.
  u32(32, 320); // Section header table.
  u32(36, 0x1234);
  u16(40, 52);
  u16(42, 32);
  u16(44, 3);
  u16(46, 40);
  u16(48, 4);

  const program = (index: number, type: number, offset: number, size: number, memSize: number) => {
    const header = 52 + index * 32;
    u32(header, type);
    u32(header + 4, offset);
    u32(header + 8, 0x8000_0000 + index * 0x1000);
    u32(header + 12, 0x9000_0000 + index * 0x1000);
    u32(header + 16, size);
    u32(header + 20, memSize);
    u32(header + 24, index === 0 ? 5 : 6);
  };
  program(0, 1, 160, 4, 4);
  program(1, 1, 164, 3, 16);
  program(2, 4, 168, 4, 4); // PT_NOTE is ignored in the result.
  bytes.set([0x13, 0, 0, 0, 0xaa, 0xbb, 0xcc], 160);

  // Null symbol followed by global object "tohost" and local function "main".
  bytes.set([0, ...Array.from("tohost", (c) => c.charCodeAt(0)), 0, 109, 97, 105, 110, 0], 176);
  u32(224, 1);
  u32(228, 0x8000_1000);
  u32(232, 8);
  bytes[236] = 0x11;
  u32(240, 8);
  u32(244, 0x8000_0000);
  u32(248, 4);
  bytes[252] = 0x02;

  // No section-name table is needed: SHT_SYMTAB's sh_link locates its names.
  u32(364, 2); // Section 1: SHT_SYMTAB.
  u32(376, 208);
  u32(380, 48);
  u32(384, 2);
  u32(396, 16);
  u32(404, 3); // Section 2: SHT_STRTAB.
  u32(416, 176);
  u32(420, 13);
  u32(444, 8); // Section 3: SHT_NOBITS.
  u32(456, 512);
  u32(460, 4096);
  return { bytes, u16, u32 };
}

function expectError(bytes: Uint8Array, code: ElfErrorCode) {
  let error: unknown;
  try {
    parseElf(bytes);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(ElfError);
  expect(error).toMatchObject({ name: "ElfError", code, message: expect.any(String) });
  expect((error as ElfError).message.length).toBeGreaterThan(0);
}

describe("parseElf", () => {
  it("reads the entry, flags and only PT_LOAD segments, including a zero-fill tail", () => {
    const { bytes } = makeElf();
    const file = parseElf(bytes);
    expect(file.entry).toBe(0x8000_0000);
    expect(file.flags).toBe(0x1234);
    expect(file.segments).toEqual([
      {
        paddr: 0x9000_0000,
        vaddr: 0x8000_0000,
        fileBytes: bytes.subarray(160, 164),
        memSize: 4,
        flags: 5,
      },
      {
        paddr: 0x9000_1000,
        vaddr: 0x8000_1000,
        fileBytes: bytes.subarray(164, 167),
        memSize: 16,
        flags: 6,
      },
    ]);
    expect(file.segments[1]!.fileBytes.buffer).toBe(bytes.buffer);
    bytes[164] = 0x42;
    expect(file.segments[1]!.fileBytes[0]).toBe(0x42);
  });

  it("respects an input view's byteOffset and byteLength", () => {
    const { bytes } = makeElf();
    const backing = new Uint8Array(1024).fill(0xff);
    backing.set(bytes, 17);
    const file = parseElf(backing.subarray(17, 529));
    expect(file.entry).toBe(0x8000_0000);
    expect([...file.segments[0]!.fileBytes]).toEqual([0x13, 0, 0, 0]);
    expect(file.segments[0]!.fileBytes.byteOffset).toBe(177);
    expectError(backing.subarray(17, 100), "truncated");
  });

  it("reads symbol fields and finds a symbol by name", () => {
    const file = parseElf(makeElf().bytes);
    expect(file.symbols).toEqual([
      { name: "", value: 0, size: 0, type: 0, binding: 0 },
      { name: "tohost", value: 0x8000_1000, size: 8, type: 1, binding: 1 },
      { name: "main", value: 0x8000_0000, size: 4, type: 2, binding: 0 },
    ]);
    expect(findSymbol(file, "tohost")).toBe(file.symbols[1]);
    expect(findSymbol(file, "missing")).toBeUndefined();
  });

  it("accepts stripped files and files without header tables", () => {
    const { bytes, u16, u32 } = makeElf();
    u32(364, 11); // SHT_DYNSYM is not the static symbol table.
    expect(parseElf(bytes).symbols).toEqual([]);
    u16(44, 0);
    u32(28, 0);
    u16(48, 0);
    u32(32, 0);
    const file = parseElf(bytes.subarray(0, 52));
    expect(file.segments).toEqual([]);
    expect(file.symbols).toEqual([]);
  });

  it("accepts a load segment with no file bytes", () => {
    const { bytes, u32 } = makeElf();
    u32(88, bytes.length);
    u32(100, 0);
    expect(parseElf(bytes).segments[1]!.fileBytes).toHaveLength(0);
    expect(parseElf(bytes).segments[1]!.memSize).toBe(16);
  });

  it("reads extended header counts from section header zero", () => {
    const { bytes, u16, u32 } = makeElf();
    u16(44, 0xffff);
    u16(48, 0);
    u32(340, 4); // sh_size holds the section count.
    u32(348, 3); // sh_info holds the program header count.
    const file = parseElf(bytes);
    expect(file.segments).toHaveLength(2);
    expect(findSymbol(file, "tohost")?.value).toBe(0x8000_1000);
  });

  it.each([
    [0, 0, "bad-magic"],
    [4, 2, "not-elf32"],
    [5, 2, "not-little-endian"],
    [18, 3, "not-riscv"],
    [16, 1, "not-executable"],
  ] as const)("rejects identification field at %i", (offset, value, code) => {
    const { bytes } = makeElf();
    bytes[offset] = value;
    expectError(bytes, code);
  });

  it("rejects every truncated prefix of the ELF header", () => {
    const { bytes } = makeElf();
    for (let size = 0; size < 52; size++) expectError(bytes.subarray(0, size), "truncated");
  });

  it.each([
    [28, 0xffff_fff0], // Program header table overflow.
    [32, 500], // Section header table.
    [56, 510], // First load segment.
    [120, 510], // Ignored PT_NOTE must still have a valid file range.
    [68, 0xffff_ffff], // Segment size overflow.
    [376, 500], // Symbol section range.
    [416, 510], // String section range.
  ])("rejects an out-of-file range at field %i", (offset, value) => {
    const { bytes, u32 } = makeElf();
    u32(offset, value);
    expectError(bytes, "truncated");
  });

  it.each([
    [40, 51], // ELF header is too small.
    [42, 31], // Program header stride is too small.
    [46, 39], // Section header stride is too small.
  ])("rejects an undersized header at field %i", (offset, value) => {
    const { bytes, u16 } = makeElf();
    u16(offset, value);
    expectError(bytes, "invalid-header");
  });

  it("validates both ELF versions and the declared header extent", () => {
    const { bytes, u16, u32 } = makeElf();
    bytes[6] = 0;
    expectError(bytes, "invalid-header");
    bytes[6] = 1;
    u32(20, 0);
    expectError(bytes, "invalid-header");
    u32(20, 1);
    u16(40, 513);
    expectError(bytes, "truncated");
  });

  it.each([28, 32])("rejects a missing header table offset at field %i", (offset) => {
    const { bytes, u32 } = makeElf();
    u32(offset, 0);
    expectError(bytes, "invalid-header");
  });

  it("validates section header zero before reading extended counts", () => {
    const { bytes, u16, u32 } = makeElf();
    u16(44, 0xffff);
    u32(32, 0);
    expectError(bytes, "invalid-header");
    u32(32, 500);
    expectError(bytes, "truncated");
  });

  it("rejects a loadable segment whose file size exceeds its memory size", () => {
    const { bytes, u32 } = makeElf();
    u32(72, 3);
    expectError(bytes, "invalid-segment");
  });

  it.each([
    [396, 0], // Zero symbol stride.
    [396, 15], // Symbol stride too small.
    [380, 47], // Partial symbol entry.
    [384, 9], // Link outside the section table.
    [384, 3], // Link to SHT_NOBITS, not SHT_STRTAB.
    [224, 13], // Name offset at the end of the string table.
  ])("rejects an invalid symbol table at field %i", (offset, value) => {
    const { bytes, u32 } = makeElf();
    u32(offset, value);
    expectError(bytes, "invalid-symbol-table");
  });

  it("rejects a name without a terminator inside the linked string table", () => {
    const { bytes } = makeElf();
    bytes[188] = 0x61;
    expectError(bytes, "invalid-symbol-table");
  });
});
