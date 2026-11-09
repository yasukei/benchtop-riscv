import { BusError } from "@benchtop-riscv/core";
import type { AccessSize, Bus } from "@benchtop-riscv/core";
import { Hart } from "./hart.js";

/** A single byte-backed test mapping; no dependency on the devices package. */
export class FakeBus implements Bus {
  readonly loads: { address: number; size: AccessSize }[] = [];
  readonly stores: { address: number; size: AccessSize; value: number }[] = [];
  readonly bytes = new Uint8Array(512);
  readonly view = new DataView(this.bytes.buffer);

  constructor(readonly base = 0x1000) {}

  load(address: number, size: AccessSize): number {
    this.loads.push({ address, size });
    this.check(address, size, "load");
    const offset = address - this.base;
    if (size === 1) return this.view.getUint8(offset);
    if (size === 2) return this.view.getUint16(offset, true);
    return this.view.getUint32(offset, true);
  }

  store(address: number, size: AccessSize, value: number): void {
    this.stores.push({ address, size, value });
    this.check(address, size, "store");
    const offset = address - this.base;
    if (size === 1) this.view.setUint8(offset, value);
    else if (size === 2) this.view.setUint16(offset, value, true);
    else this.view.setUint32(offset, value, true);
  }

  private check(address: number, size: AccessSize, access: "load" | "store"): void {
    if (address < this.base || address + size > this.base + this.bytes.length) {
      throw new BusError(address, access);
    }
  }
}

export function program(words: readonly number[], direct = true, windowSize = 192) {
  const bus = new FakeBus();
  words.forEach((word, index) => bus.view.setUint32(index * 4, word, true));
  const hart = new Hart(
    bus,
    direct ? { base: bus.base, bytes: bus.bytes.subarray(0, windowSize) } : undefined,
  );
  hart.reset(bus.base);
  return { hart, bus };
}
