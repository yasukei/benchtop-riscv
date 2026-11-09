import { BusError } from "@benchtop-riscv/core";
import type { AccessSize, Bus, Device } from "@benchtop-riscv/core";
import { validateRegion } from "./memory-region.js";

interface Region {
  readonly base: number;
  readonly end: number;
  readonly device: Device;
}

/** Routes physical accesses to non-overlapping, memory-mapped devices. */
export class PhysicalBus implements Bus {
  private readonly regions: Region[] = [];

  map(base: number, device: Device): void {
    validateRegion(base, device.size);
    const end = base + device.size;
    for (const region of this.regions) {
      if (base < region.end && end > region.base) {
        throw new RangeError("Device region overlaps an existing mapping");
      }
    }
    this.regions.push({ base, end, device });
  }

  load(address: number, size: AccessSize): number {
    const region = this.findRegion(address, size, "load");
    return region.device.load(address - region.base, size);
  }

  store(address: number, size: AccessSize, value: number): void {
    const region = this.findRegion(address, size, "store");
    region.device.store(address - region.base, size, value);
  }

  private findRegion(address: number, size: AccessSize, access: "load" | "store"): Region {
    if (Number.isInteger(address) && address >= 0 && address <= 0xffff_ffff) {
      for (const region of this.regions) {
        if (address >= region.base && address + size <= region.end) {
          return region;
        }
      }
    }
    throw new BusError(address, access);
  }
}
