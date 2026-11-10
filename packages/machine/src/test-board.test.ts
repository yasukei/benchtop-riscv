import { afterEach, describe, expect, it, vi } from "vitest";
import type { StopReason } from "@benchtop-riscv/core";
import { parseElf } from "@benchtop-riscv/elf";
import type { ElfFile } from "@benchtop-riscv/elf";
import { createTestBoard, LoadError } from "./index.js";

const base = 0x8000_0000;
const loop = 0x0000006f; // jal x0, 0

/** Build a real ELF32 file with two PT_LOAD segments and optional HTIF symbols. */
function makeElf(
  options: {
    words?: number[];
    data?: number[];
    dataAddress?: number;
    dataSize?: number;
    entry?: number;
    htif?: boolean;
    tohost?: number;
    vaddr?: number;
  } = {},
): ElfFile {
  const bytes = new Uint8Array(768);
  const view = new DataView(bytes.buffer);
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  const words = options.words ?? [loop];
  const data = options.data ?? [];
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1]);
  u16(16, 2); // ET_EXEC
  u16(18, 243); // EM_RISCV
  u32(20, 1);
  u32(24, options.entry ?? base);
  u32(28, 52);
  u16(40, 52);
  u16(42, 32);
  u16(44, 2);
  // Code and data have distinct physical addresses; vaddr is deliberately optional.
  u32(52, 1);
  u32(56, 128);
  u32(60, options.vaddr ?? base);
  u32(64, base);
  u32(68, words.length * 4);
  u32(72, words.length * 4);
  u32(76, 5);
  words.forEach((word, index) => u32(128 + index * 4, word));
  u32(84, 1);
  u32(88, 256);
  u32(92, options.dataAddress ?? base + 0x100);
  u32(96, options.dataAddress ?? base + 0x100);
  u32(100, data.length);
  u32(104, options.dataSize ?? 16);
  u32(108, 6);
  bytes.set(data, 256);

  if (options.htif) {
    u32(32, 512);
    u16(46, 40);
    u16(48, 3);
    // SHT_SYMTAB: null symbol, tohost and fromhost.
    u32(556, 2);
    u32(568, 384);
    u32(572, 48);
    u32(576, 2);
    u32(588, 16);
    u32(596, 3); // SHT_STRTAB
    u32(608, 448);
    u32(612, 17);
    bytes.set([0, ...Array.from("tohost\0fromhost\0", (c) => c.charCodeAt(0))], 448);
    u32(400, 1);
    u32(404, options.tohost ?? base + 0x100);
    u32(408, 8);
    u32(416, 8);
    u32(420, base + 0x108);
    u32(424, 8);
  }
  return parseElf(bytes);
}

// x1 = RAM base; x2 = result; store to the ELF's tohost word.
function resultProgram(result = 1, tail = loop): number[] {
  return [0x800000b7, (result << 20) | 0x113, 0x1020a023, tail];
}

afterEach(() => vi.restoreAllMocks());

describe("test board ELF loading", () => {
  it("loads by paddr, zero-fills BSS and starts at entry", () => {
    const board = createTestBoard({ ramSize: 512 });
    const words = [
      0x800000b7, // lui x1, 0x80000
      0x1000a103, // lw x2, 256(x1): file bytes
      0x1040a183, // lw x3, 260(x1): BSS
      0x10c0a203, // lw x4, 268(x1): last word in BSS
      loop,
    ];
    board.load(makeElf({ words, data: [0x78, 0x56, 0x34, 0x12], vaddr: 0x1000 }));
    expect(board.hart.pc).toBe(base);
    expect(board.run(4)).toEqual({ kind: "budget" });
    expect([...board.hart.x.slice(2, 5)]).toEqual([0x12345678, 0, 0]);
  });

  it("clears old RAM, BSS, hart state and HTIF on reload", () => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf({ words: resultProgram(), htif: true, data: Array(16).fill(0xff) }));
    board.hart.run(3); // Leave a pending HTIF result in RAM.
    const words = [0x800000b7, 0x1000a103, 0x1080a183, 0x1800a203, loop];
    board.load(makeElf({ words, dataAddress: base + 0x180, data: [42], htif: false }));
    expect(board.hart.pc).toBe(base);
    expect(board.hart.instret).toBe(0);
    expect([...board.hart.x]).toEqual(Array(32).fill(0));
    expect(board.run(4)).toEqual({ kind: "budget" });
    expect([...board.hart.x.slice(2, 5)]).toEqual([0, 0, 42]);
  });

  it("resets execution to a non-base entry and replaces HTIF on reload", () => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf());
    board.load(makeElf({ words: [loop, ...resultProgram(7)], entry: base + 4, htif: true }));
    expect(board.hart.pc).toBe(base + 4);
    expect(board.run(10)).toEqual({ kind: "halt", exitCode: 3 });
  });

  it("provides 16 MiB by default and accepts a segment ending at the RAM boundary", () => {
    const board = createTestBoard();
    board.load(makeElf({ dataAddress: base + 16 * 1024 * 1024 - 16 }));
    expect(board.run(1)).toEqual({ kind: "budget" });
  });

  it.each([
    { dataAddress: base - 4 },
    { dataAddress: base + 512 },
    { dataAddress: base + 508, dataSize: 8 },
    { dataAddress: 0xffff_fff0, dataSize: 32 },
  ])("rejects an out-of-RAM or wrapping segment: %j", (options) => {
    const board = createTestBoard({ ramSize: 512 });
    expect(() => board.load(makeElf(options))).toThrowError(LoadError);
    expect(() => board.load(makeElf(options))).toThrowError(
      expect.objectContaining({ code: "segment-outside-ram" }),
    );
  });

  it.each([base - 4, base + 4, base + 0x110, base + 0x200])(
    "rejects an entry outside all segment memory extents: %i",
    (entry) => {
      expect(() => createTestBoard({ ramSize: 512 }).load(makeElf({ entry }))).toThrowError(
        expect.objectContaining({ name: "LoadError", code: "entry-outside-segments" }),
      );
    },
  );

  it("rejects an ELF with no loadable segment", () => {
    expect(() => createTestBoard().load({ ...makeElf(), segments: [] })).toThrowError(
      expect.objectContaining({ code: "entry-outside-segments" }),
    );
  });

  it("reports invalid HTIF placement as a typed load error", () => {
    expect(() =>
      createTestBoard({ ramSize: 512 }).load(makeElf({ htif: true, tohost: base + 508 })),
    ).toThrowError(expect.objectContaining({ name: "LoadError", code: "invalid-htif" }));
  });

  it("leaves the loaded program intact after a load error", () => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf({ words: resultProgram(), htif: true }));
    expect(() => board.load(makeElf({ dataAddress: 0 }))).toThrowError(LoadError);
    expect(board.run(20)).toEqual({ kind: "halt", exitCode: 0 });
  });
});

describe("test board memory inspection", () => {
  it("reads unsigned little-endian words, including guest writes and zero-filled RAM", () => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf({ words: resultProgram(7) }));
    expect(board.readWord(base)).toBe(0x800000b7);
    expect(board.readWord(base + 0x100)).toBe(0);
    board.run(3);
    expect(board.readWord(base + 0x100)).toBe(7);
    expect(board.readWord(base + 508)).toBe(0);
  });

  it.each([base - 4, base + 1, base + 510, base + 512, 0x1_8000_0000, NaN, Infinity, base + 0.5])(
    "returns undefined for an unreadable word address: %s",
    (address) => {
      expect(createTestBoard({ ramSize: 512 }).readWord(address)).toBeUndefined();
    },
  );
});

describe("test board execution", () => {
  it("halts a guest that reports success then loops", () => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf({ words: resultProgram(), htif: true }));
    expect(board.run(20_000)).toEqual({ kind: "halt", exitCode: 0 });
    expect(board.hart.instret).toBe(10_000); // Poll at the first slice boundary.
  });

  it("halts even after an illegal instruction in the same slice", () => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf({ words: resultProgram(1, 0xffff_ffff), htif: true }));
    expect(board.run(10_000)).toEqual({ kind: "halt", exitCode: 0 });
    expect(board.hart.instret).toBe(3);
    expect(board.hart.pc).toBe(0); // Illegal instruction traps under minimal M-mode.
  });

  it("runs without HTIF when the symbol is missing", () => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf({ words: resultProgram() }));
    expect(board.run(25_003)).toEqual({ kind: "budget" });
    expect(board.hart.instret).toBe(25_003);
  });

  it("uses attempt budgets even when no instruction retires", () => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf({ words: [0xffff_ffff] }));
    const run = vi.spyOn(board.hart, "run");
    expect(board.run(25_003)).toEqual({ kind: "budget" });
    expect(run.mock.calls).toEqual([[10_000], [10_000], [5_003]]);
    expect(board.hart.instret).toBe(0);
  });

  it("polls after the final partial slice and clears the result word", () => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf({ words: resultProgram(9), htif: true }));
    expect(board.run(3)).toEqual({ kind: "halt", exitCode: 4 });
    expect(board.run(1)).toEqual({ kind: "budget" });
  });

  // The current hart delivers traps rather than early stop reasons. Inject those
  // StopReason variants here to verify the board's handling of the full contract.
  const earlyStops: StopReason[] = [
    { kind: "fatal", message: "Test failure" },
    { kind: "breakpoint", pc: base + 12 },
  ];
  it.each(earlyStops)("prioritizes HTIF over an early $kind stop", (stop) => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf({ words: resultProgram(), htif: true }));
    const run = board.hart.run.bind(board.hart);
    vi.spyOn(board.hart, "run").mockImplementation(() => {
      run(3);
      return stop;
    });
    expect(board.run(20_000)).toEqual({ kind: "halt", exitCode: 0 });
  });

  it.each(earlyStops)("propagates an early $kind without an HTIF result", (stop) => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf({ htif: true }));
    const run = vi.spyOn(board.hart, "run").mockReturnValue(stop);
    expect(board.run(20_000)).toEqual(stop);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does no work for a zero budget", () => {
    const board = createTestBoard({ ramSize: 512 });
    board.load(makeElf());
    const run = vi.spyOn(board.hart, "run");
    expect(board.run(0)).toEqual({ kind: "budget" });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid budget: %s",
    (budget) => {
      expect(() => createTestBoard({ ramSize: 512 }).run(budget)).toThrowError(RangeError);
    },
  );
});
