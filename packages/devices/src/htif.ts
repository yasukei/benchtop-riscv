import type { Ram } from "./ram.js";

/** Polls HTIF result words in RAM without adding hooks to the hart's memory path. */
export class Htif {
  private readonly tohostOffset: number;

  constructor(
    private readonly ram: Ram,
    readonly tohost: number,
    /** Reserved for future host replies; polling does not read or write it. */
    readonly fromhost?: number,
  ) {
    const offset = tohost - ram.base;
    if (!Number.isInteger(tohost) || offset < 0 || offset + 8 > ram.size) {
      throw new RangeError("The 64-bit tohost word must fit entirely in RAM");
    }
    this.tohostOffset = offset;
  }

  poll(): { kind: "halt"; exitCode: number } | undefined {
    const low = this.ram.load(this.tohostOffset, 4);
    const high = this.ram.load(this.tohostOffset + 4, 4);
    // Only odd values with a zero upper word encode program termination.
    if (high !== 0 || (low & 1) === 0) return undefined;

    this.ram.store(this.tohostOffset, 4, 0);
    this.ram.store(this.tohostOffset + 4, 4, 0);
    return { kind: "halt", exitCode: low >>> 1 };
  }
}
