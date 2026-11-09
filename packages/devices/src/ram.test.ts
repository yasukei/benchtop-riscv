import type { RamWindow } from "@benchtop-riscv/core";
import { BusError } from "@benchtop-riscv/core";
import { describe, expect, it } from "vitest";
import { Ram } from "./index.js";

describe("Ram", () => {
  it("exposes a zero-filled direct-access window", () => {
    const ram = new Ram(0x8000_0000, 8);
    const window: RamWindow = ram;
    expect(window.base).toBe(0x8000_0000);
    expect(window.bytes).toBeInstanceOf(Uint8Array);
    expect(window.bytes).toHaveLength(ram.size);
    expect(Array.from(window.bytes)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it.each([
    { size: 1, value: 0xab },
    { size: 2, value: 0xabcd },
    { size: 4, value: 0x89ab_cdef },
  ] as const)("round trips unsigned $size-byte values at every valid offset", ({ size, value }) => {
    const ram = new Ram(0x8000_0000, 16);
    for (let offset = 0; offset <= ram.size - size; offset++) {
      ram.store(offset, size, value);
      expect(ram.load(offset, size)).toBe(value);
    }
  });

  it("uses little-endian order for misaligned loads and stores", () => {
    const ram = new Ram(0, 8);
    ram.store(1, 4, 0x89ab_cdef);
    expect(Array.from(ram.bytes)).toEqual([0, 0xef, 0xcd, 0xab, 0x89, 0, 0, 0]);
    expect(ram.load(1, 2)).toBe(0xcdef);
    expect(ram.load(3, 2)).toBe(0x89ab);
    ram.store(3, 2, 0x1234);
    expect(Array.from(ram.bytes)).toEqual([0, 0xef, 0xcd, 0x34, 0x12, 0, 0, 0]);
    expect(ram.load(1, 4)).toBe(0x1234_cdef);
  });

  it.each([
    { size: 1, value: 0x1234_56ab, expected: 0xab },
    { size: 2, value: 0x1234_abcd, expected: 0xabcd },
    { size: 4, value: 0x1_89ab_cdef, expected: 0x89ab_cdef },
    { size: 1, value: -1, expected: 0xff },
    { size: 2, value: -1, expected: 0xffff },
    { size: 4, value: -1, expected: 0xffff_ffff },
  ] as const)(
    "truncates $value to $size bytes and zero-extends the load",
    ({ size, value, expected }) => {
      const ram = new Ram(0, 8);
      ram.bytes.fill(0x55);
      ram.store(1, size, value);
      expect(ram.load(1, size)).toBe(expected);
      expect(ram.bytes[0]).toBe(0x55);
      expect(ram.bytes[1 + size]).toBe(0x55);
    },
  );

  it.each([1, 2, 4] as const)(
    "rejects invalid %i-byte accesses without changing memory",
    (size) => {
      const ram = new Ram(0x8000_0000, 8);
      ram.bytes.fill(0x55);
      for (const offset of [-1, 0.5, NaN, Infinity, 8 - size + 1, 8]) {
        expect(() => ram.load(offset, size)).toThrow(BusError);
        expect(() => ram.load(offset, size)).toThrow(
          expect.objectContaining({ address: ram.base + offset, access: "load" }),
        );
        expect(() => ram.store(offset, size, 0xffff_ffff)).toThrow(BusError);
        expect(() => ram.store(offset, size, 0xffff_ffff)).toThrow(
          expect.objectContaining({ address: ram.base + offset, access: "store" }),
        );
        expect(Array.from(ram.bytes)).toEqual([0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55]);
      }
    },
  );

  it("supports RAM ending at the last physical byte without wrapping", () => {
    const ram = new Ram(0xffff_fffc, 4);
    ram.store(0, 4, 0xffff_ffff);
    expect(ram.load(3, 1)).toBe(0xff);
    expect(() => ram.load(3, 2)).toThrow(
      expect.objectContaining({ address: 0xffff_ffff, access: "load" }),
    );
  });

  it.each([
    [-1, 4],
    [0x1_0000_0000, 4],
    [0.5, 4],
    [NaN, 4],
    [Infinity, 4],
    [0, 0],
    [0, -1],
    [0, 0.5],
    [0, NaN],
    [0, Infinity],
    [0xffff_ffff, 2],
  ])("rejects an invalid or wrapping RAM region (%s, %s)", (base, size) => {
    expect(() => new Ram(base, size)).toThrow(RangeError);
  });
});
