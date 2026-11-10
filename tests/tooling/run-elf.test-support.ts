/** Synthetic ELF32 executable with one RAM segment and a tohost symbol in BSS. */
export function makeRunnerElf(
  options: { words?: readonly number[]; entry?: number } = {},
): Uint8Array {
  const bytes = new Uint8Array(384);
  const view = new DataView(bytes.buffer);
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  const words = options.words ?? resultProgram(1);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1]);
  u16(16, 2); // ET_EXEC
  u16(18, 243); // EM_RISCV
  u32(20, 1);
  u32(24, options.entry ?? 0x80000000);
  u32(28, 52);
  u32(32, 256);
  u16(40, 52);
  u16(42, 32);
  u16(44, 1);
  u16(46, 40);
  u16(48, 3);
  // PT_LOAD: code at the RAM base; tohost occupies eight zero-filled BSS bytes.
  u32(52, 1);
  u32(56, 128);
  u32(60, 0x80000000);
  u32(64, 0x80000000);
  u32(68, words.length * 4);
  u32(72, 0x108);
  u32(76, 7);
  words.forEach((word, index) => u32(128 + index * 4, word));
  // Symbol table: null symbol followed by tohost, linked to the string table.
  u32(300, 2);
  u32(312, 160);
  u32(316, 32);
  u32(320, 2);
  u32(332, 16);
  u32(176, 1);
  u32(180, 0x80000100);
  u32(184, 8);
  u32(340, 3);
  u32(352, 192);
  u32(356, 8);
  bytes.set([0, 116, 111, 104, 111, 115, 116, 0], 192); // \0tohost\0
  return bytes;
}

/** lui ra,0x80000; li sp,result; sw sp,256(ra); j . */
export function resultProgram(result: number): readonly number[] {
  return [0x800000b7, (result << 20) | 0x113, 0x1020a023, 0x0000006f];
}
