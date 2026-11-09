import { describe, expect, it } from "vitest";
import { Hart } from "./index.js";
import { encodeB, encodeI, encodeJ, encodeR, encodeS, encodeU } from "./encoding.test-support.js";
import { FakeBus, program } from "./hart.test-support.js";

const addi = (rd: number, rs1: number, imm: number) => encodeI(0x13, 0, rd, rs1, imm);

// Expected values are architectural results, including signed Int32Array representation.
const aluCases = [
  ["add overflow", 0, 0, 0x7fffffff, 1, -2147483648],
  ["sub overflow", 0, 0x20, -2147483648, 1, 2147483647],
  ["sll masks shift", 1, 0, 1, 63, -2147483648],
  ["slt signed", 2, 0, -2147483648, 0x7fffffff, 1],
  ["slt equality", 2, 0, -1, -1, 0],
  ["sltu unsigned", 3, 0, -1, 1, 0],
  ["sltu high bit", 3, 0, 0x7fffffff, -2147483648, 1],
  ["xor", 4, 0, 0x55aa55aa, -1, -1437226411],
  ["srl masks shift", 5, 0, -2147483648, 63, 1],
  ["sra sign fill", 5, 0x20, -2147483648, 63, -1],
  ["or", 6, 0, 0x5500, 0xaa, 0x55aa],
  ["and", 7, 0, -1, 0x55aa, 0x55aa],
] as const;
const immediateCases = [
  ["addi overflow", 0, 1, 0x7fffffff, -2147483648],
  ["addi sign extension", 0, -1, 0, -1],
  ["slti signed", 2, -1, -2147483648, 1],
  ["slti equality", 2, -1, -1, 0],
  ["sltiu sign-extended immediate", 3, -1, 1, 1],
  ["sltiu equality", 3, -1, -1, 0],
  ["xori", 4, -1, 0x55aa55aa, -1437226411],
  ["ori", 6, -2048, 0x55, -1963],
  ["andi", 7, -1, 0x55aa, 0x55aa],
  ["slli", 1, 31, 1, -2147483648],
  ["srli", 5, 31, -2147483648, 1],
  ["srai sign fill", 5, 0x400 + 31, -2147483648, -1],
] as const;

for (const direct of [true, false]) {
  describe(direct ? "hart with RAM window" : "hart with bus only", () => {
    it.each(aluCases)("executes %s", (_name, f3, f7, a, b, expected) => {
      const { hart } = program([encodeR(0x33, f3, f7, 3, 1, 2)], direct);
      hart.x[1] = a;
      hart.x[2] = b;
      expect(hart.step()).toEqual({ kind: "budget" });
      expect(hart.x[3]).toBe(expected);
      expect(hart.pc).toBe(0x1004);
      expect(hart.instret).toBe(1);
    });

    it.each(immediateCases)("executes %s", (_name, f3, imm, a, expected) => {
      const { hart } = program([encodeI(0x13, f3, 1, 1, imm)], direct);
      hart.x[1] = a;
      expect(hart.step()).toEqual({ kind: "budget" });
      expect(hart.x[1]).toBe(expected);
    });

    it("executes LUI and PC-relative AUIPC", () => {
      const { hart } = program(
        [encodeU(0x37, 1, 0x80000000), encodeU(0x17, 2, 0xfffff000)],
        direct,
      );
      expect(hart.run(2)).toEqual({ kind: "budget" });
      expect(hart.x[1]).toBe(-2147483648);
      expect(hart.x[2]).toBe(4);
    });

    it.each([
      ["beq", 0, -1, -1],
      ["bne", 1, -1, 1],
      ["blt", 4, -2147483648, 0x7fffffff],
      ["bge", 5, 0x7fffffff, -2147483648],
      ["bltu", 6, 0x7fffffff, -2147483648],
      ["bgeu", 7, -2147483648, 0x7fffffff],
    ] as const)("takes and skips %s", (_name, f3, a, b) => {
      for (const taken of [true, false]) {
        const { hart } = program([encodeB(f3, 1, 2, -4)], direct);
        hart.x[1] = a;
        hart.x[2] = taken ? b : f3 <= 1 ? -b : a;
        // BGE/BGEU are inclusive, so use the reverse ordered pair for their false case.
        if (!taken && (f3 === 5 || f3 === 7)) {
          hart.x[1] = b;
          hart.x[2] = a;
        }
        expect(hart.step()).toEqual({ kind: "budget" });
        expect(hart.pc).toBe(taken ? 0x0ffc : 0x1004);
        expect(hart.instret).toBe(1);
      }
    });

    it.each([5, 7])("takes an inclusive comparison branch with funct3 %i", (f3) => {
      const { hart } = program([encodeB(f3, 1, 1, 8)], direct);
      expect(hart.step().kind).toBe("budget");
      expect(hart.pc).toBe(0x1008);
    });

    it("links JAL and JALR, clears bit zero and reads the old aliased source", () => {
      const { hart } = program([encodeJ(1, 8), addi(3, 0, 99), encodeI(0x67, 0, 1, 1, 1)], direct);
      expect(hart.run(2)).toEqual({ kind: "budget" });
      expect(hart.x[1]).toBe(0x100c);
      expect(hart.x[3]).toBe(0);
      expect(hart.pc).toBe(0x1004);
    });

    for (const offset of [128, 129, 256, 257]) {
      it.each([
        ["lb", 0, -128],
        ["lh", 1, -128],
        ["lw", 2, -128],
        ["lbu", 4, 128],
        ["lhu", 5, 65408],
      ] as const)(`loads %s at offset ${offset}`, (_name, f3, expected) => {
        const { hart, bus } = program([encodeI(0x03, f3, 2, 1, -1)], direct);
        bus.view.setUint32(offset, 0xffffff80, true);
        hart.x[1] = bus.base + offset + 1;
        expect(hart.step().kind).toBe("budget");
        expect(hart.x[2]).toBe(expected);
        expect(bus.loads.some((load) => load.address === bus.base + offset)).toBe(
          !direct || offset >= 192,
        );
      });

      it.each([
        [0, 1],
        [1, 2],
        [2, 4],
      ] as const)(`stores funct3 %i at offset ${offset}`, (f3, size) => {
        const { hart, bus } = program([encodeS(f3, 1, 2, -1)], direct);
        hart.x[1] = bus.base + offset + 1;
        hart.x[2] = -1985229329; // 0x89abcdef
        expect(hart.step().kind).toBe("budget");
        expect([...bus.bytes.subarray(offset, offset + size)]).toEqual(
          [0xef, 0xcd, 0xab, 0x89].slice(0, size),
        );
        expect(bus.bytes[offset + size]).toBe(0);
        expect(bus.stores).toHaveLength(!direct || offset >= 192 ? 1 : 0);
      });
    }

    it("discards x0 writes but still performs loads to x0", () => {
      const { hart, bus } = program(
        [addi(0, 0, 42), encodeI(0x03, 2, 0, 1, 0), encodeJ(0, 4)],
        direct,
      );
      hart.x[1] = bus.base + 256;
      expect(hart.run(3).kind).toBe("budget");
      expect(hart.x[0]).toBe(0);
      expect(bus.loads.some((load) => load.address === 0x1100)).toBe(true);
      expect(hart.instret).toBe(3);
    });
  });
}

describe("hart control and faults", () => {
  it("runs bounded slices and resets all architectural state", () => {
    const { hart } = program([addi(1, 1, 1), encodeJ(0, -4)]);
    expect(hart.x).toBeInstanceOf(Int32Array);
    expect(hart.x).toHaveLength(32);
    expect(hart.run(0)).toEqual({ kind: "budget" });
    expect(hart.instret).toBe(0);
    expect(hart.run(5)).toEqual({ kind: "budget" });
    expect(hart.x[1]).toBe(3);
    expect(hart.pc).toBe(0x1004);
    expect(hart.instret).toBe(5);
    expect(hart.run(1).kind).toBe("budget");
    expect(hart.pc).toBe(0x1000);
    hart.reset(-4);
    expect(hart.pc).toBe(0xfffffffc);
    expect([...hart.x]).toEqual(Array<number>(32).fill(0));
    expect(hart.instret).toBe(0);
  });

  it.each([-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid budget %s",
    (budget) => {
      const { hart } = program([addi(1, 1, 1)]);
      expect(() => hart.run(budget)).toThrow(RangeError);
      expect(hart.instret).toBe(0);
    },
  );

  it.each([
    ["illegal", 0xffffffff],
    ["ecall", 0x00000073],
    ["ebreak", 0x00100073],
    ["mret", 0x30200073],
    ["wfi", 0x10500073],
    ["CSR", 0x300110f3],
    ["reserved JALR", encodeI(0x67, 1, 1, 0, 0)],
    ["reserved branch", encodeB(2, 0, 0, 4)],
    ["reserved load", encodeI(3, 3, 1, 0, 0)],
    ["reserved store", encodeS(3, 0, 0, 0)],
    ["reserved SLLI", encodeI(0x13, 1, 1, 0, 0x20)],
    ["reserved SRLI", encodeI(0x13, 5, 1, 0, 0x20)],
    ["RV32M", encodeR(0x33, 0, 1, 1, 0, 0)],
    ["reserved SUB", encodeR(0x33, 1, 0x20, 1, 0, 0)],
    ["reserved fence", encodeI(0x0f, 2, 0, 0, 0)],
    ["misaligned JAL", encodeJ(1, 2)],
    ["misaligned JALR", encodeI(0x67, 0, 1, 0, 3)],
    ["misaligned branch", encodeB(0, 0, 0, 2)],
  ] as const)("stops on %s without retiring or committing state", (_name, word) => {
    const { hart } = program([addi(1, 0, 7), word, addi(1, 0, 9)]);
    expect(hart.run(1).kind).toBe("budget");
    expect(hart.run(0).kind).toBe("budget");
    for (let retry = 0; retry < 2; retry++) {
      expect(hart.run(10)).toMatchObject({
        kind: "fatal",
        message: expect.stringContaining("0x00001004"),
      });
      expect(hart.pc).toBe(0x1004);
      expect(hart.instret).toBe(1);
      expect(hart.x[1]).toBe(7);
    }
  });

  it("does not check the target of an untaken branch", () => {
    const { hart } = program([encodeB(1, 0, 0, 2)]);
    expect(hart.step().kind).toBe("budget");
    expect(hart.pc).toBe(0x1004);
  });

  it("executes fences as no-ops, including ignored reserved fields", () => {
    const { hart } = program([encodeI(0x0f, 0, 1, 2, -1), encodeI(0x0f, 1, 1, 2, -1)]);
    hart.x[1] = 42;
    expect(hart.run(2).kind).toBe("budget");
    expect(hart.x[1]).toBe(42);
    expect(hart.instret).toBe(2);
  });

  it.each(["fetch", "load", "store", "load to x0"])(
    "reports a bus %s fault at the current PC",
    (access) => {
      const word =
        access === "store"
          ? encodeS(2, 1, 2, 0)
          : encodeI(3, 2, access === "load to x0" ? 0 : 2, 1, 0);
      const { hart } = program([word]);
      hart.x[1] = 0x2000;
      hart.x[2] = 42;
      if (access === "fetch") hart.pc = 0x2000;
      const pc = hart.pc;
      expect(hart.step()).toMatchObject({ kind: "fatal", message: expect.stringContaining("Bus") });
      expect(hart.pc).toBe(pc);
      expect(hart.x[2]).toBe(42);
      expect(hart.instret).toBe(0);
    },
  );

  it("rejects a misaligned fetch without touching the bus", () => {
    const { hart, bus } = program([]);
    hart.pc = 0x1002;
    expect(hart.run(1).kind).toBe("fatal");
    expect(hart.pc).toBe(0x1002);
    expect(hart.instret).toBe(0);
    expect(bus.loads).toEqual([]);
  });

  it.each([2, 4] as const)("routes a %i-byte load crossing the RAM window to the bus", (size) => {
    const { hart, bus } = program([encodeI(3, size === 2 ? 5 : 2, 2, 1, 0)], true, 192);
    bus.view.setUint32(191, 0x12345678, true);
    hart.x[1] = 0x10bf;
    expect(hart.step().kind).toBe("budget");
    expect(hart.x[2]).toBe(size === 2 ? 0x5678 : 0x12345678);
    expect(bus.loads).toEqual([{ address: 0x10bf, size }]);
  });

  it("routes a fetch crossing the RAM window to the bus", () => {
    const { hart, bus } = program([addi(1, 0, 7)], true, 3);
    expect(hart.step().kind).toBe("budget");
    expect(hart.x[1]).toBe(7);
    expect(bus.loads).toEqual([{ address: 0x1000, size: 4 }]);
  });

  it.each([2, 4] as const)(
    "routes a %i-byte store crossing the window wholly to the bus",
    (size) => {
      const { hart, bus } = program([encodeS(size === 2 ? 1 : 2, 1, 2, 0)]);
      hart.x[1] = 0x10bf;
      hart.x[2] = -1;
      expect(hart.step().kind).toBe("budget");
      expect(bus.stores).toEqual([{ address: 0x10bf, size, value: 0xffffffff }]);
      expect([...bus.bytes.subarray(191, 191 + size)]).toEqual(Array<number>(size).fill(255));
    },
  );

  it.each(["load", "store"])("lets the bus reject a %s crossing the end of RAM", (access) => {
    const { hart, bus } = program(
      [access === "load" ? encodeI(3, 2, 2, 1, 0) : encodeS(2, 1, 2, 0)],
      true,
      512,
    );
    hart.x[1] = 0x11ff;
    hart.x[2] = -1;
    expect(hart.run(2).kind).toBe("fatal");
    expect(hart.instret).toBe(0);
    expect(hart.pc).toBe(0x1000);
    expect(bus.bytes[511]).toBe(0);
    expect(access === "load" ? bus.loads : bus.stores).toHaveLength(1);
  });

  it("wraps the PC and AUIPC result at the 32-bit boundary", () => {
    const bus = new FakeBus(0xfffffe00);
    bus.view.setUint32(508, encodeU(0x17, 1, 0x1000), true);
    const hart = new Hart(bus, { base: bus.base, bytes: bus.bytes });
    hart.reset(0xfffffffc);
    expect(hart.step().kind).toBe("budget");
    expect(hart.pc).toBe(0);
    expect(hart.x[1]).toBe(0xffc);
  });

  it("wraps effective addresses before bus access", () => {
    const { hart, bus } = program([encodeI(3, 4, 2, 1, 1)]);
    hart.x[1] = -1;
    expect(hart.step().kind).toBe("fatal");
    expect(bus.loads).toEqual([{ address: 0, size: 1 }]);
  });

  it("propagates unexpected host errors", () => {
    const hart = new Hart({
      load() {
        throw new Error("device bug");
      },
      store() {},
    });
    expect(() => hart.step()).toThrow("device bug");
  });
});
