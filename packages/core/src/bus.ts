/** Width of a single memory access in bytes. */
export type AccessSize = 1 | 2 | 4;

/**
 * A memory-mapped device. Offsets are relative to the device's base address and are always
 * within `[0, size)`. Values are unsigned 32-bit integers (`>>> 0`); a load of 1 or 2 bytes
 * returns the zero-extended value and the hart sign-extends it if needed.
 */
export interface Device {
  readonly size: number;
  load(offset: number, size: AccessSize): number;
  store(offset: number, size: AccessSize, value: number): void;
}

/**
 * The physical address space seen by a hart. An access that no device decodes throws
 * {@link BusError}; the hart turns it into an access-fault trap.
 */
export interface Bus {
  load(address: number, size: AccessSize): number;
  store(address: number, size: AccessSize, value: number): void;
}

/** Thrown by a {@link Bus} for an access that no device decodes. */
export class BusError extends Error {
  constructor(
    readonly address: number,
    readonly access: "load" | "store",
  ) {
    super(`Bus ${access} fault at 0x${(address >>> 0).toString(16).padStart(8, "0")}`);
    this.name = "BusError";
  }
}
