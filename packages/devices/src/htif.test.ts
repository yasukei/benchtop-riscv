import { describe, expect, it } from "vitest";
import { Htif, Ram } from "./index.js";

describe("Htif", () => {
  it.each([
    { low: 0, high: 0 },
    { low: 2, high: 0 },
    { low: 0xffff_fffe, high: 0 },
    { low: 1, high: 1 },
    { low: 0, high: 0x8000_0000 },
    { low: 0xffff_ffff, high: 0xffff_ffff },
  ])("ignores and preserves tohost with low=$low, high=$high", ({ low, high }) => {
    const ram = new Ram(0x8000_0000, 32);
    const htif = new Htif(ram, ram.base + 8);
    ram.store(8, 4, low);
    ram.store(12, 4, high);
    const before = ram.bytes.slice();

    expect(htif.poll()).toBeUndefined();
    expect(ram.bytes).toEqual(before);
  });

  it.each([
    { value: 1, exitCode: 0 },
    { value: (5 << 1) | 1, exitCode: 5 },
    { value: 0x8000_0001, exitCode: 0x4000_0000 },
    { value: 0xffff_ffff, exitCode: 0x7fff_ffff },
  ])("reports exit code $exitCode and clears tohost", ({ value, exitCode }) => {
    const ram = new Ram(0x8000_0000, 32);
    const htif = new Htif(ram, ram.base + 8, ram.base + 16);
    ram.bytes.fill(0x55);
    ram.store(8, 4, value);
    ram.store(12, 4, 0);
    const expected = ram.bytes.slice();
    expected.fill(0, 8, 16);

    expect(htif.poll()).toEqual({ kind: "halt", exitCode });
    expect(ram.bytes).toEqual(expected);
    expect(htif.poll()).toBeUndefined();
  });

  it("reads little-endian bytes written through the direct RAM window", () => {
    const ram = new Ram(0x8000_0000, 16);
    const htif = new Htif(ram, ram.base + 1);
    ram.bytes.set([0x0b, 0x02, 0x04, 0x08, 0, 0, 0, 0], 1);

    expect(htif.poll()).toEqual({ kind: "halt", exitCode: 0x0402_0105 });
    expect(ram.bytes).toEqual(new Uint8Array(16));
  });

  it.each([0x8000_0000, 0xffff_fff8])("accepts a tohost word exactly filling RAM at %i", (base) => {
    const ram = new Ram(base, 8);
    const htif = new Htif(ram, base);
    ram.store(0, 4, 1);

    expect(htif.poll()).toEqual({ kind: "halt", exitCode: 0 });
    expect(ram.bytes).toEqual(new Uint8Array(8));
  });

  it.each([
    -1,
    0x7fff_ffff,
    0x8000_0009,
    0x8000_0010,
    0x1_0000_0000,
    0x8000_0000 + 0.5,
    NaN,
    Infinity,
    -Infinity,
  ])("rejects a tohost address that cannot hold a full word: %s", (tohost) => {
    const ram = new Ram(0x8000_0000, 16);
    expect(() => new Htif(ram, tohost)).toThrow(RangeError);
  });

  it("rejects RAM smaller than the tohost word", () => {
    const ram = new Ram(0x8000_0000, 7);
    expect(() => new Htif(ram, ram.base)).toThrow(RangeError);
  });
});
