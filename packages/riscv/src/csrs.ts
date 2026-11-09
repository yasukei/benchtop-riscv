/** The synchronous exceptions used internally by the interpreter. */
export class Trap {
  constructor(
    readonly cause: number,
    readonly value: number,
  ) {}
}

/** Minimal M-mode CSR state; guest access checks live in the SYSTEM executor. */
export class Csrs {
  mstatus = 0;
  mtvec = 0;
  mscratch = 0;
  mepc = 0;
  mcause = 0;
  mtval = 0;

  reset(): void {
    this.mstatus = this.mtvec = this.mscratch = this.mepc = this.mcause = this.mtval = 0;
  }

  /** Undefined means the CSR does not exist, including for write-only instructions. */
  read(address: number): number | undefined {
    switch (address) {
      case 0x300:
        return this.mstatus;
      case 0x301:
        return 0x40000100; // MXL=RV32, I; WARL writes are ignored.
      case 0x304: // mie: interrupts are not implemented yet.
      case 0xf11: // mvendorid
      case 0xf12: // marchid
      case 0xf13: // mimpid
      case 0xf14: // mhartid
        return 0;
      case 0x305:
        return this.mtvec;
      case 0x340:
        return this.mscratch;
      case 0x341:
        return this.mepc;
      case 0x342:
        return this.mcause;
      case 0x343:
        return this.mtval;
      default:
        return undefined;
    }
  }

  write(address: number, value: number): void {
    value >>>= 0;
    switch (address) {
      case 0x300:
        // Only MIE, MPIE and MPP exist. Unsupported MPP values become U.
        this.mstatus = (value & 0x88) | ((value & 0x1800) === 0x1800 ? 0x1800 : 0);
        break;
      case 0x305:
        this.mtvec = (value & ~3) >>> 0;
        break;
      case 0x340:
        this.mscratch = value;
        break;
      case 0x341:
        this.mepc = (value & ~3) >>> 0;
        break;
      case 0x342:
        this.mcause = value;
        break;
      case 0x343:
        this.mtval = value;
        break;
    }
  }
}
