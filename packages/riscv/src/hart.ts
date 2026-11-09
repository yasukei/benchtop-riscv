import { BusError } from "@benchtop-riscv/core";
import type { AccessSize, Bus, RamWindow, StopReason } from "@benchtop-riscv/core";
import * as f from "./fields.js";

const budgetStop: StopReason = { kind: "budget" };

/** RV32I interpreter. A successful step returns `budget` after one retired instruction. */
export class Hart {
  readonly x = new Int32Array(32);
  pc = 0;
  instret = 0;

  constructor(
    private readonly bus: Bus,
    private readonly ram?: RamWindow,
  ) {}

  reset(pc: number): void {
    this.x.fill(0);
    this.pc = pc >>> 0;
    this.instret = 0;
  }

  /** The budget counts attempts, including instructions that fail without retiring. */
  run(budget: number): StopReason {
    if (!Number.isSafeInteger(budget) || budget < 0) {
      throw new RangeError("Instruction budget must be a nonnegative safe integer");
    }
    for (let attempt = 0; attempt < budget; attempt++) {
      const stop = this.step();
      if (stop.kind !== "budget") return stop;
    }
    return budgetStop;
  }

  step(): StopReason {
    this.x[0] = 0;
    this.pc >>>= 0;
    if ((this.pc & 3) !== 0) return this.fatal("Misaligned instruction address");
    try {
      return this.execute(this.load(this.pc, 4));
    } catch (error) {
      if (error instanceof BusError) return this.fatal(error.message);
      throw error;
    }
  }

  // Extract fields directly: decode() produces objects intended for tooling, not this hot path.
  private execute(word: number): StopReason {
    const rd = f.rd(word);
    const a = this.x[f.rs1(word)]!;
    const b = this.x[f.rs2(word)]!;
    const funct3 = f.funct3(word);
    const funct7 = f.funct7(word);
    let next = (this.pc + 4) >>> 0;
    let value = 0;
    let writesRd = true;
    switch (f.opcode(word)) {
      case 0x37:
        value = f.immU(word);
        break;
      case 0x17:
        value = this.pc + f.immU(word);
        break;
      case 0x6f:
        value = next;
        next = (this.pc + f.immJ(word)) >>> 0;
        break;
      case 0x67:
        if (funct3 !== 0) return this.illegal(word);
        value = next;
        next = ((a + f.immI(word)) & ~1) >>> 0;
        break;
      case 0x63: {
        writesRd = false;
        let taken: boolean;
        switch (funct3) {
          case 0:
            taken = a === b;
            break;
          case 1:
            taken = a !== b;
            break;
          case 4:
            taken = a < b;
            break;
          case 5:
            taken = a >= b;
            break;
          case 6:
            taken = a >>> 0 < b >>> 0;
            break;
          case 7:
            taken = a >>> 0 >= b >>> 0;
            break;
          default:
            return this.illegal(word);
        }
        if (taken) next = (this.pc + f.immB(word)) >>> 0;
        break;
      }
      case 0x03: {
        const address = (a + f.immI(word)) >>> 0;
        switch (funct3) {
          case 0:
            value = (this.load(address, 1) << 24) >> 24;
            break;
          case 1:
            value = (this.load(address, 2) << 16) >> 16;
            break;
          case 2:
            value = this.load(address, 4);
            break;
          case 4:
            value = this.load(address, 1) & 0xff;
            break;
          case 5:
            value = this.load(address, 2) & 0xffff;
            break;
          default:
            return this.illegal(word);
        }
        break;
      }
      case 0x23: {
        writesRd = false;
        const address = (a + f.immS(word)) >>> 0;
        switch (funct3) {
          case 0:
            this.store(address, 1, b);
            break;
          case 1:
            this.store(address, 2, b);
            break;
          case 2:
            this.store(address, 4, b);
            break;
          default:
            return this.illegal(word);
        }
        break;
      }
      case 0x13: {
        const imm = f.immI(word);
        switch (funct3) {
          case 0:
            value = a + imm;
            break;
          case 2:
            value = a < imm ? 1 : 0;
            break;
          case 3:
            value = a >>> 0 < imm >>> 0 ? 1 : 0;
            break;
          case 4:
            value = a ^ imm;
            break;
          case 6:
            value = a | imm;
            break;
          case 7:
            value = a & imm;
            break;
          case 1:
            if (funct7 !== 0) return this.illegal(word);
            value = a << f.shamt(word);
            break;
          case 5:
            if (funct7 === 0) value = a >>> f.shamt(word);
            else if (funct7 === 0x20) value = a >> f.shamt(word);
            else return this.illegal(word);
            break;
        }
        break;
      }
      case 0x33:
        if (funct7 !== 0 && !(funct7 === 0x20 && (funct3 === 0 || funct3 === 5))) {
          return this.illegal(word);
        }
        switch (funct3) {
          case 0:
            value = funct7 === 0 ? a + b : a - b;
            break;
          case 1:
            value = a << (b & 31);
            break;
          case 2:
            value = a < b ? 1 : 0;
            break;
          case 3:
            value = a >>> 0 < b >>> 0 ? 1 : 0;
            break;
          case 4:
            value = a ^ b;
            break;
          case 5:
            value = funct7 === 0 ? a >>> (b & 31) : a >> (b & 31);
            break;
          case 6:
            value = a | b;
            break;
          case 7:
            value = a & b;
            break;
        }
        break;
      case 0x0f:
        if (funct3 !== 0 && funct3 !== 1) return this.illegal(word);
        writesRd = false;
        break;
      case 0x73:
        if (word === 0x00000073) return this.fatal("ecall");
        if (word === 0x00100073) return this.fatal("ebreak");
        return this.illegal(word);
      default:
        return this.illegal(word);
    }
    // Check before committing a jump's link register or retiring the instruction.
    if ((next & 3) !== 0) return this.fatal("Misaligned instruction target");
    if (writesRd && rd !== 0) this.x[rd] = value | 0;
    this.pc = next;
    this.instret++;
    return budgetStop;
  }

  private load(address: number, size: AccessSize): number {
    const ram = this.ram;
    const offset = ram === undefined ? -1 : address - ram.base;
    if (ram !== undefined && offset >= 0 && offset + size <= ram.bytes.length) {
      const bytes = ram.bytes;
      let value = bytes[offset]!;
      if (size >= 2) value |= bytes[offset + 1]! << 8;
      if (size === 4) value |= (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24);
      return value >>> 0;
    }
    return this.bus.load(address, size);
  }

  private store(address: number, size: AccessSize, value: number): void {
    const ram = this.ram;
    const offset = ram === undefined ? -1 : address - ram.base;
    if (ram !== undefined && offset >= 0 && offset + size <= ram.bytes.length) {
      const bytes = ram.bytes;
      bytes[offset] = value;
      if (size >= 2) bytes[offset + 1] = value >>> 8;
      if (size === 4) {
        bytes[offset + 2] = value >>> 16;
        bytes[offset + 3] = value >>> 24;
      }
      return;
    }
    this.bus.store(address, size, value >>> 0);
  }

  private illegal(word: number): StopReason {
    return this.fatal(`Illegal instruction 0x${(word >>> 0).toString(16).padStart(8, "0")}`);
  }

  private fatal(message: string): StopReason {
    return {
      kind: "fatal",
      message: `${message} at PC 0x${this.pc.toString(16).padStart(8, "0")}`,
    };
  }
}
