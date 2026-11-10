import type { StopReason } from "@benchtop-riscv/core";
import { Htif, PhysicalBus, Ram } from "@benchtop-riscv/devices";
import { findSymbol } from "@benchtop-riscv/elf";
import type { ElfFile } from "@benchtop-riscv/elf";
import { Hart } from "@benchtop-riscv/riscv";

const ramBase = 0x8000_0000;
const defaultRamSize = 16 * 1024 * 1024;
const sliceSize = 10_000;
const budgetStop: StopReason = { kind: "budget" };

export type LoadErrorCode = "segment-outside-ram" | "entry-outside-segments" | "invalid-htif";

/** An ELF image cannot be placed on this board. */
export class LoadError extends Error {
  constructor(
    readonly code: LoadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LoadError";
  }
}

export interface TestBoard {
  readonly hart: Hart;
  load(elf: ElfFile): void;
  /** Counts instruction attempts, including traps that do not retire an instruction. */
  run(budget: number): StopReason;
}

class TestBoardImpl implements TestBoard {
  readonly hart: Hart;
  private readonly ram: Ram;
  private htif: Htif | undefined;

  constructor(ramSize: number) {
    this.ram = new Ram(ramBase, ramSize);
    const bus = new PhysicalBus();
    bus.map(ramBase, this.ram);
    this.hart = new Hart(bus, this.ram);
  }

  load(elf: ElfFile): void {
    const ramEnd = ramBase + this.ram.size;
    for (const segment of elf.segments) {
      // Ordinary number arithmetic preserves an end beyond 2^32 for rejection.
      const end = segment.paddr + segment.memSize;
      if (
        !Number.isInteger(segment.paddr) ||
        !Number.isInteger(segment.memSize) ||
        segment.paddr < ramBase ||
        segment.memSize < segment.fileBytes.length ||
        end > ramEnd
      ) {
        throw new LoadError("segment-outside-ram", "Loadable segment does not fit in board RAM");
      }
    }
    // This board executes at physical addresses, without virtual address translation.
    if (
      !elf.segments.some(
        (segment) => elf.entry >= segment.paddr && elf.entry < segment.paddr + segment.memSize,
      )
    ) {
      throw new LoadError(
        "entry-outside-segments",
        "Entry point is outside every loadable segment",
      );
    }

    const tohost = findSymbol(elf, "tohost");
    let htif: Htif | undefined;
    if (tohost !== undefined) {
      try {
        htif = new Htif(this.ram, tohost.value, findSymbol(elf, "fromhost")?.value);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        throw new LoadError("invalid-htif", error.message);
      }
    }

    // Validate first, so a rejected image leaves the current program intact.
    this.ram.bytes.fill(0);
    for (const segment of elf.segments) {
      const offset = segment.paddr - ramBase;
      this.ram.bytes.set(segment.fileBytes, offset);
      this.ram.bytes.fill(0, offset + segment.fileBytes.length, offset + segment.memSize);
    }
    this.hart.reset(elf.entry);
    this.htif = htif;
  }

  run(budget: number): StopReason {
    if (!Number.isSafeInteger(budget) || budget < 0) {
      throw new RangeError("Instruction budget must be a nonnegative safe integer");
    }
    let remaining = budget;
    while (remaining > 0) {
      const slice = Math.min(remaining, sliceSize);
      const stop = this.hart.run(slice);
      const halt = this.htif?.poll();
      if (halt !== undefined) return halt;
      if (stop.kind !== "budget") return stop;
      remaining -= slice;
    }
    return budgetStop;
  }
}

/** Bare-metal board with RAM at 0x80000000 and optional ELF-symbol HTIF. */
export function createTestBoard(options?: { ramSize?: number }): TestBoard {
  return new TestBoardImpl(options?.ramSize ?? defaultRamSize);
}
