import { BusError } from "@benchtop-riscv/core";
import type { AccessSize, Bus, RamWindow, StopReason } from "@benchtop-riscv/core";
import * as f from "./fields.js";
import { Csrs, Trap } from "./csrs.js";

const budgetStop: StopReason = { kind: "budget" };

/** RV32I interpreter with minimal M/U privilege and synchronous trap delivery. */
export class Hart {
  readonly x = new Int32Array(32);
  pc = 0;
  instret = 0;
  private privilege: 0 | 3 = 3;
  private readonly csrs = new Csrs();

  constructor(
    private readonly bus: Bus,
    private readonly ram?: RamWindow,
  ) {}

  reset(pc: number): void {
    this.x.fill(0);
    this.pc = pc >>> 0;
    this.instret = 0;
    this.privilege = 3;
    this.csrs.reset();
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
    let fetching = true;
    try {
      if ((this.pc & 3) !== 0) throw new Trap(0, this.pc);
      const word = this.load(this.pc, 4);
      fetching = false;
      return this.execute(word);
    } catch (error) {
      if (error instanceof Trap) this.enterTrap(error.cause, error.value);
      else if (error instanceof BusError) {
        this.enterTrap(fetching ? 1 : error.access === "load" ? 5 : 7, error.address);
      } else throw error;
      return budgetStop;
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
        if (funct3 !== 0) {
          value = this.executeCsr(word);
          break;
        }
        writesRd = false;
        if (word === 0x00000073) throw new Trap(this.privilege === 0 ? 8 : 11, 0);
        if (word === 0x00100073) throw new Trap(3, this.pc);
        if (word === 0x30200073 && this.privilege === 3) {
          this.privilege = (this.csrs.mstatus & 0x1800) === 0x1800 ? 3 : 0;
          this.csrs.mstatus = ((this.csrs.mstatus & 0x80) >>> 4) | 0x80;
          next = this.csrs.mepc;
          break;
        }
        if (word === 0x10500073 && this.privilege === 3) break;
        return this.illegal(word);
      default:
        return this.illegal(word);
    }
    // Check before committing a jump's link register or retiring the instruction.
    if ((next & 3) !== 0) throw new Trap(0, next);
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

  private executeCsr(word: number): number {
    const address = f.csr(word);
    const funct3 = f.funct3(word);
    const operation = funct3 & 3;
    if (operation === 0 || this.privilege < ((address >>> 8) & 3)) {
      return this.illegal(word);
    }
    const source = f.rs1(word);
    const value = funct3 >= 5 ? source : this.x[source]!;
    // The encoded source, not its register value, controls write suppression.
    const writes = operation === 1 || source !== 0;
    if (writes && address >>> 10 === 3) return this.illegal(word);
    // Validate existence even when CSRRW suppresses the architectural read (rd=x0).
    // These minimal CSRs have no read side effects.
    const old = this.csrs.read(address);
    if (old === undefined) return this.illegal(word);
    if (writes) {
      this.csrs.write(
        address,
        operation === 1 ? value : operation === 2 ? old | value : old & ~value,
      );
    }
    return operation === 1 && f.rd(word) === 0 ? 0 : old;
  }

  private enterTrap(cause: number, value: number): void {
    this.csrs.mepc = (this.pc & ~3) >>> 0;
    this.csrs.mcause = cause;
    this.csrs.mtval = value >>> 0;
    this.csrs.mstatus = ((this.csrs.mstatus & 8) << 4) | (this.privilege << 11);
    this.privilege = 3;
    this.pc = this.csrs.mtvec;
  }

  private illegal(word: number): never {
    throw new Trap(2, word >>> 0);
  }
}
