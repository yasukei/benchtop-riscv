import { BusError } from "@benchtop-riscv/core";
import type { AccessSize, Device, RamWindow } from "@benchtop-riscv/core";
import { validateRegion } from "./memory-region.js";

/** Little-endian RAM. The byte view also provides the hart's direct-access window. */
export class Ram implements Device, RamWindow {
  readonly bytes: Uint8Array;
  private readonly view: DataView;

  constructor(
    readonly base: number,
    readonly size: number,
  ) {
    validateRegion(base, size);
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }

  load(offset: number, size: AccessSize): number {
    this.checkAccess(offset, size, "load");
    switch (size) {
      case 1:
        return this.view.getUint8(offset);
      case 2:
        return this.view.getUint16(offset, true);
      case 4:
        return this.view.getUint32(offset, true);
    }
  }

  store(offset: number, size: AccessSize, value: number): void {
    this.checkAccess(offset, size, "store");
    switch (size) {
      case 1:
        this.view.setUint8(offset, value);
        break;
      case 2:
        this.view.setUint16(offset, value, true);
        break;
      case 4:
        this.view.setUint32(offset, value, true);
        break;
    }
  }

  private checkAccess(offset: number, size: AccessSize, access: "load" | "store"): void {
    if (!Number.isInteger(offset) || offset < 0 || offset + size > this.size) {
      throw new BusError(this.base + offset, access);
    }
  }
}
