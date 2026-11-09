import { describe, expect, it } from "vitest";
import { Hart } from "./hart.js";
import { encodeB, encodeI, encodeJ, encodeU } from "./encoding.test-support.js";
import { FakeBus, program, readTrapState } from "./hart.test-support.js";

const csr = (address: number, funct3: number, rd = 2, source = 1) =>
  encodeI(0x73, funct3, rd, source, address);
const addi = (rd: number, rs1: number, imm: number) => encodeI(0x13, 0, rd, rs1, imm);

function fixture() {
  const { hart, bus } = program([]);
  const execute = (word: number) => {
    bus.view.setUint32(0, word, true);
    hart.pc = bus.base;
    expect(hart.step()).toEqual({ kind: "budget" });
  };
  const write = (address: number, value: number) => {
    hart.x[1] = value;
    execute(csr(address, 1, 0));
    expect(hart.pc).toBe(bus.base + 4);
  };
  const read = (address: number) => {
    execute(csr(address, 2, 2, 0));
    expect(hart.pc).toBe(bus.base + 4);
    return hart.x[2]! >>> 0;
  };
  return { hart, bus, execute, write, read };
}

describe("machine CSRs", () => {
  it.each([
    ["misa", 0x301, 0x40000100],
    ["mie", 0x304, 0],
    ["mtvec", 0x305, 0xfffffffc],
    ["mscratch", 0x340, 0xffffffff],
    ["mepc", 0x341, 0xfffffffc],
    ["mcause", 0x342, 0xffffffff],
    ["mtval", 0x343, 0xffffffff],
    ["mstatus", 0x300, 0x1888],
  ] as const)("implements %s WARL/read-write behavior", (_name, address, expected) => {
    const { read, write } = fixture();
    expect(read(address!)).toBe(address === 0x301 ? 0x40000100 : 0);
    write(address!, -1);
    expect(read(address!)).toBe(expected);
    write(address!, 0);
    expect(read(address!)).toBe(address === 0x301 ? 0x40000100 : 0);
  });

  it.each([0, 1, 2, 3])("normalizes MPP=%i to an implemented mode", (mpp) => {
    const { read, write } = fixture();
    write(0x300, (mpp << 11) | 0x88);
    expect(read(0x300)).toBe(mpp === 3 ? 0x1888 : 0x88);
  });

  it.each([0, 1, 2, 3])("forces mtvec/mepc low bits %i to zero", (low) => {
    const { read, write } = fixture();
    for (const address of [0x305, 0x341]) {
      write(address, 0x1000 | low);
      expect(read(address)).toBe(0x1000);
    }
  });

  it.each([0xf11, 0xf12, 0xf13, 0xf14])("reads identity CSR 0x%s as zero", (address) => {
    const { read } = fixture();
    expect(read(address)).toBe(0);
  });

  it.each([
    ["csrrw", 1, 0x12345678, 0x12345678],
    ["csrrs", 2, 0x12345678, 0xff3456ff],
    ["csrrc", 3, 0x12345678, 0xed000087],
    ["csrrwi", 5, 31, 31],
    ["csrrsi", 6, 31, 0xff0000ff],
    ["csrrci", 7, 31, 0xff0000e0],
  ] as const)("executes %s and returns the old value", (_name, op, source, expected) => {
    const { hart, write, read, execute } = fixture();
    write(0x340, 0xff0000ff);
    hart.x[1] = source;
    const retired = hart.instret;
    execute(csr(0x340, op, 2, op >= 5 ? source : 1));
    expect(hart.x[2]! >>> 0).toBe(0xff0000ff);
    expect(hart.instret).toBe(retired + 1);
    expect(read(0x340)).toBe(expected);
  });

  it("reads the old rs1 when rd aliases it", () => {
    const { hart, execute, write, read } = fixture();
    write(0x340, 0x55);
    hart.x[1] = 0xaa;
    execute(csr(0x340, 1, 1, 1));
    expect(hart.x[1]).toBe(0x55);
    expect(read(0x340)).toBe(0xaa);
  });

  it.each([1, 5])("writes zero for swap funct3=%i with zero source and rd=x0", (op) => {
    const { hart, execute, write, read } = fixture();
    write(0x340, 123);
    execute(csr(0x340, op, 0, 0));
    expect(hart.x[0]).toBe(0);
    expect(read(0x340)).toBe(0);
  });

  it.each([2, 3, 6, 7])("suppresses writes only for encoded zero source, funct3=%i", (op) => {
    const { hart, bus, execute, write, read } = fixture();
    write(0x340, 0x123);
    execute(csr(0x340, op, 2, 0));
    expect(hart.x[2]).toBe(0x123);
    expect(read(0x340)).toBe(0x123);
    // Read-only CSRs distinguish a suppressed write from a write of zero.
    execute(csr(0xf11, op, 0, 0));
    expect(hart.pc).toBe(0x1004);
    hart.x[1] = 0;
    execute(csr(0xf11, op, 2, 1));
    expect(hart.pc).toBe(0);
    expect(readTrapState(hart, bus)).toMatchObject({ mcause: 2, mtval: csr(0xf11, op, 2, 1) });
  });

  it.each([0xf11, 0xf12, 0xf13, 0xf14])("rejects writes to read-only CSR 0x%s", (address) => {
    for (const op of [1, 2, 3, 5, 6, 7]) {
      const { hart, bus, execute } = fixture();
      hart.x[1] = 0;
      hart.x[2] = 42;
      const word = csr(address, op);
      execute(word);
      expect(hart.pc).toBe(0);
      expect(hart.instret).toBe(0);
      expect(hart.x[2]).toBe(42);
      expect(readTrapState(hart, bus)).toEqual({
        mepc: 0x1000,
        mcause: 2,
        mtval: word,
        mstatus: 0x1800,
      });
    }
  });

  it.each([0x744, 0x180, 0x3b0, 0x3a0, 0x302, 0x303, 0x344, 0xc00, 0xc01, 0xc02])(
    "rejects unknown CSR 0x%s even when reads or writes are suppressed",
    (address) => {
      for (const [op, rd, source] of [
        [1, 0, 0],
        [2, 2, 0],
        [5, 0, 0],
        [6, 0, 0],
      ]) {
        const { hart, bus, execute } = fixture();
        const word = csr(address, op!, rd!, source!);
        execute(word);
        expect(hart.pc).toBe(0);
        expect(hart.instret).toBe(0);
        expect(readTrapState(hart, bus)).toMatchObject({ mcause: 2, mtval: word });
      }
    },
  );

  it("rejects reserved SYSTEM encodings", () => {
    for (const word of [csr(0x340, 4), 0x302000f3, 0x10508073]) {
      const { hart, bus, execute } = fixture();
      execute(word);
      expect(hart.pc).toBe(0);
      expect(readTrapState(hart, bus)).toMatchObject({ mcause: 2, mtval: word });
    }
  });
});

describe("trap entry and privilege return", () => {
  it.each([0, 8])("saves MIE=%i on entry and restores it with mret", (mie) => {
    const { hart, bus, write, execute, read } = fixture();
    write(0x305, 0x1100);
    write(0x300, mie);
    execute(0x00100073); // ebreak
    expect(hart.pc).toBe(0x1100);
    expect(read(0x300)).toBe(0x1800 | (mie << 4));
    expect(read(0x341)).toBe(0x1000);
    expect(read(0x342)).toBe(3);
    expect(read(0x343)).toBe(0x1000);
    const retired = hart.instret;
    execute(0x30200073);
    expect(hart.pc).toBe(0x1000);
    expect(hart.instret).toBe(retired + 1);
    expect(read(0x300)).toBe(0x80 | mie); // Still in M; MPP was cleared to U.
    execute(0x00000073);
    expect(hart.pc).toBe(0x1100);
    expect(readTrapState(hart, bus)).toMatchObject({ mcause: 11 });
  });

  it.each([0, 0x80])("returns to U and delivers ecall cause 8 with MPIE=%i", (mpie) => {
    const { hart, bus, write, execute } = fixture();
    write(0x305, 0x1100);
    write(0x300, mpie);
    write(0x341, 0x1080);
    execute(0x30200073);
    expect(hart.pc).toBe(0x1080);
    bus.view.setUint32(128, 0x00000073, true);
    const retired = hart.instret;
    expect(hart.step()).toEqual({ kind: "budget" });
    expect(hart.pc).toBe(0x1100);
    expect(hart.instret).toBe(retired);
    expect(readTrapState(hart, bus)).toEqual({ mepc: 0x1080, mcause: 8, mtval: 0, mstatus: mpie });
  });

  it.each([0x30200073, 0x10500073, csr(0x300, 2, 2, 0), csr(0x301, 1, 0), csr(0xf14, 2, 2, 0)])(
    "traps privileged instruction 0x%s in U-mode without changing rd",
    (word) => {
      const { hart, bus, write, execute } = fixture();
      write(0x305, 0x1100);
      write(0x341, 0x1080);
      execute(0x30200073);
      hart.x[2] = 42;
      bus.view.setUint32(128, word, true);
      const retired = hart.instret;
      hart.step();
      expect(hart.pc).toBe(0x1100);
      expect(hart.x[2]).toBe(42);
      expect(hart.instret).toBe(retired);
      expect(readTrapState(hart, bus)).toEqual({
        mepc: 0x1080,
        mcause: 2,
        mtval: word,
        mstatus: 0,
      });
    },
  );

  it("retires wfi as an M-mode no-op", () => {
    const { hart } = program([0x10500073, addi(1, 0, 7)]);
    expect(hart.run(2)).toEqual({ kind: "budget" });
    expect(hart.instret).toBe(2);
    expect(hart.x[1]).toBe(7);
  });

  it("bounds repeated traps by attempts instead of retirements", () => {
    const { hart, write, execute } = fixture();
    write(0x305, 0x1000);
    execute(0x00000073);
    const retired = hart.instret;
    expect(hart.run(1000)).toEqual({ kind: "budget" });
    expect(hart.pc).toBe(0x1000);
    expect(hart.instret).toBe(retired);
  });

  it("resets CSRs and restores M-mode after entering U-mode", () => {
    const { hart, write, execute, read } = fixture();
    for (const address of [0x305, 0x340, 0x341, 0x342, 0x343]) write(address, 0x1100);
    execute(0x30200073);
    hart.reset(0x1000);
    expect(hart.instret).toBe(0);
    expect([...hart.x]).toEqual(Array<number>(32).fill(0));
    for (const address of [0x300, 0x304, 0x305, 0x340, 0x341, 0x342, 0x343])
      expect(read(address)).toBe(0);
    expect(read(0x301)).toBe(0x40000100);
    execute(0x00000073);
    expect(read(0x342)).toBe(11);
  });
});

// Hand-assembled complete p startup from riscv-test-env
// 6de71edb142be36319e380ce782c3d1830c65d68, as recorded in the fixture README.
// Offsets match rv32ui-p-simple.dump; no guest binary or cross-toolchain is needed.
function pStartup(): number[] {
  return [
    encodeJ(0, 0x50),
    ...Array<number>(19).fill(addi(0, 0, 0)), // trap_vector at +4, reserved until entry
    ...Array.from({ length: 31 }, (_, index) => addi(index + 1, 0, 0)),
    csr(0xf14, 2, 10, 0), // +cc RISCV_MULTICORE_DISABLE
    encodeB(1, 10, 0, 0),
    encodeU(0x17, 5, 0), // +d4 INIT_RNMI
    addi(5, 5, 16),
    csr(0x305, 1, 0, 5),
    csr(0x744, 5, 0, 8),
    encodeU(0x17, 5, 0), // +e4 INIT_SATP
    addi(5, 5, 16),
    csr(0x305, 1, 0, 5),
    csr(0x180, 5, 0, 0),
    encodeU(0x17, 5, 0), // +f4 INIT_PMP
    addi(5, 5, 32),
    csr(0x305, 1, 0, 5),
    encodeU(0x37, 5, 0x80000000),
    addi(5, 5, -1),
    csr(0x3b0, 1, 0, 5),
    addi(5, 0, 31),
    csr(0x3a0, 1, 0, 5),
    csr(0x304, 5, 0, 0), // +114 DELEGATE_NO_TRAPS: unprotected mie write
    encodeU(0x17, 5, 0),
    addi(5, 5, 20),
    csr(0x305, 1, 0, 5),
    csr(0x302, 5, 0, 0),
    csr(0x303, 5, 0, 0),
    addi(3, 0, 0),
    encodeU(0x17, 5, 0), // +130 mtvec <- trap_vector (+4)
    addi(5, 5, -300),
    csr(0x305, 1, 0, 5),
    addi(10, 0, 1), // CHECK_XLEN
    encodeI(0x13, 1, 10, 10, 31),
    encodeB(4, 10, 0, 24),
    0x0ff0000f,
    addi(3, 0, 1),
    addi(17, 0, 93),
    addi(10, 0, 0),
    0x00000073,
    addi(5, 0, 0), // +15c no supervisor trap handler
    encodeB(0, 5, 0, 20),
    csr(0x105, 1, 0, 5),
    encodeU(0x37, 5, 0xb000),
    addi(5, 5, 265),
    csr(0x302, 1, 0, 5),
    csr(0x300, 5, 0, 0), // +174 mstatus <- 0
    encodeU(0x17, 5, 0),
    addi(5, 5, 20),
    csr(0x341, 1, 0, 5),
    csr(0xf14, 2, 10, 0),
    0x30200073, // +188 mret to U
    0x0ff0000f,
    addi(3, 0, 1),
    addi(17, 0, 93),
    addi(10, 0, 0),
    0x00000073, // +19c ecall back to M
  ];
}

it.each([true, false])("runs complete pinned env/p startup with direct RAM: %s", (direct) => {
  const bus = new FakeBus();
  pStartup().forEach((word, index) => bus.view.setUint32(index * 4, word, true));
  const hart = new Hart(bus, direct ? { base: bus.base, bytes: bus.bytes } : undefined);
  hart.reset(bus.base);
  const traps: number[] = [];
  for (let attempt = 0; attempt < 160 && hart.pc !== bus.base + 4; attempt++) {
    const pc = hart.pc;
    const retired = hart.instret;
    expect(hart.step()).toEqual({ kind: "budget" });
    if (hart.instret === retired) traps.push(pc);
  }
  expect(hart.pc).toBe(0x1004);
  expect(traps).toEqual([0x10e0, 0x10f0, 0x1108, 0x1124, 0x119c]);
  expect(hart.x[3]).toBe(1);
  expect(readTrapState(hart, bus)).toEqual({ mepc: 0x119c, mcause: 8, mtval: 0, mstatus: 0 });
});
