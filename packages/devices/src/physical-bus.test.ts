import type { Device } from "@benchtop-riscv/core";
import { BusError } from "@benchtop-riscv/core";
import { describe, expect, it, vi } from "vitest";
import { PhysicalBus, Ram } from "./index.js";

function device(size: number, value = 0) {
  return { size, load: vi.fn(() => value), store: vi.fn() } satisfies Device;
}

describe("PhysicalBus", () => {
  it("routes accesses to two devices using relative offsets and preserves arguments", () => {
    const bus = new PhysicalBus();
    const first = device(16, 0xffff_ffff);
    const second = device(16, 0xabcd);
    bus.map(0x8000_0000, first);
    bus.map(0x1000, second);

    expect(bus.load(0x8000_0003, 4)).toBe(0xffff_ffff);
    expect(bus.load(0x1005, 2)).toBe(0xabcd);
    expect(first.load).toHaveBeenCalledExactlyOnceWith(3, 4);
    expect(second.load).toHaveBeenCalledExactlyOnceWith(5, 2);

    bus.store(0x1007, 1, 0xff);
    bus.store(0x8000_0008, 4, 0x8765_4321);
    expect(first.store).toHaveBeenCalledExactlyOnceWith(8, 4, 0x8765_4321);
    expect(second.store).toHaveBeenCalledExactlyOnceWith(7, 1, 0xff);
  });

  it.each(["load", "store"] as const)(
    "reports the address and kind for an unmapped %s",
    (access) => {
      const bus = new PhysicalBus();
      bus.map(0x1000, device(16));
      for (const address of [0, 0xfff, 0x1010, 0x8000_0000, 0xffff_ffff]) {
        const act = () => (access === "load" ? bus.load(address, 1) : bus.store(address, 1, 0xff));
        expect(act).toThrow(BusError);
        expect(act).toThrow(expect.objectContaining({ address, access }));
      }
    },
  );

  it.each([
    [0x1000, 16],
    [0x1001, 1],
    [0x0fff, 2],
    [0x100f, 2],
    [0x0fff, 18],
  ])("rejects an overlapping region at %i of size %i", (base, size) => {
    const bus = new PhysicalBus();
    bus.map(0x1000, device(16));
    expect(() => bus.map(base, device(size))).toThrow(RangeError);
  });

  it("allows adjacent regions and rejects a cross-region access before forwarding it", () => {
    const bus = new PhysicalBus();
    const first = device(4, 0x11);
    const second = device(4, 0x22);
    bus.map(0x1004, second);
    bus.map(0x1000, first);
    expect(bus.load(0x1000, 4)).toBe(0x11);
    expect(bus.load(0x1004, 4)).toBe(0x22);
    first.load.mockClear();
    second.load.mockClear();

    for (const size of [2, 4] as const) {
      expect(() => bus.load(0x1003, size)).toThrow(
        expect.objectContaining({ address: 0x1003, access: "load" }),
      );
      expect(() => bus.store(0x1003, size, 0xffff_ffff)).toThrow(
        expect.objectContaining({ address: 0x1003, access: "store" }),
      );
    }
    expect(first.load).not.toHaveBeenCalled();
    expect(second.load).not.toHaveBeenCalled();
    expect(first.store).not.toHaveBeenCalled();
    expect(second.store).not.toHaveBeenCalled();
  });

  it("rejects accesses crossing the end of an isolated region", () => {
    const bus = new PhysicalBus();
    const mapped = device(4);
    bus.map(0x1000, mapped);
    expect(() => bus.load(0x1002, 4)).toThrow(BusError);
    expect(() => bus.store(0x1002, 4, 0)).toThrow(BusError);
    expect(mapped.load).not.toHaveBeenCalled();
    expect(mapped.store).not.toHaveBeenCalled();
  });

  it("accepts the last physical byte but rejects mappings and accesses that wrap", () => {
    const bus = new PhysicalBus();
    const mapped = device(4, 0xff);
    expect(() => bus.map(0xffff_fffd, mapped)).toThrow(RangeError);
    bus.map(0xffff_fffc, mapped);
    expect(bus.load(0xffff_ffff, 1)).toBe(0xff);
    bus.store(0xffff_fffc, 4, 0x8765_4321);
    expect(mapped.store).toHaveBeenCalledExactlyOnceWith(0, 4, 0x8765_4321);
    expect(() => bus.load(0xffff_ffff, 2)).toThrow(BusError);
    expect(() => bus.store(0xffff_ffff, 2, 0)).toThrow(BusError);
  });

  it.each([
    [-1, 1],
    [0x1_0000_0000, 1],
    [0.5, 1],
    [NaN, 1],
    [Infinity, 1],
    [0, 0],
    [0, -1],
    [0, 0.5],
    [0, NaN],
    [0, Infinity],
    [0, 0x1_0000_0001],
  ])("rejects an invalid base or device size (%s, %s)", (base, size) => {
    expect(() => new PhysicalBus().map(base, device(size))).toThrow(RangeError);
  });

  it.each([-1, 0.5, NaN, Infinity, 0x1_0000_0000])("faults on invalid address %s", (address) => {
    const bus = new PhysicalBus();
    bus.map(0, device(4));
    expect(() => bus.load(address, 1)).toThrow(BusError);
    expect(() => bus.store(address, 1, 0)).toThrow(BusError);
  });

  it("shares RAM storage with the direct-access window", () => {
    const ram = new Ram(0x8000_0000, 16);
    const bus = new PhysicalBus();
    bus.map(ram.base, ram);
    bus.store(ram.base + 1, 4, 0x8765_4321);
    expect(Array.from(ram.bytes.subarray(1, 5))).toEqual([0x21, 0x43, 0x65, 0x87]);
    ram.bytes[2] = 0xff;
    expect(bus.load(ram.base + 1, 4)).toBe(0x8765_ff21);
  });
});
