import { describe, expect, it } from "vitest";
import { PhysicalBus, Ram } from "@benchtop-riscv/devices";
import { Hart } from "@benchtop-riscv/riscv";

describe("hart with real RAM and physical bus", () => {
  it.each([true, false])("runs a program with direct RAM enabled: %s", (direct) => {
    const bus = new PhysicalBus();
    const code = new Ram(0x1000, 128);
    const data = new Ram(0x2000, 32);
    bus.map(code.base, code);
    bus.map(data.base, data);
    // x1 = code base; x2 = data base; x3 = -128; misaligned stores and loads.
    const words = [
      0x000010b7, // lui x1, 0x1
      0x00002137, // lui x2, 0x2
      0xf8000193, // addi x3, x0, -128
      0x0430a0a3, // sw x3, 65(x1)
      0x0410a203, // lw x4, 65(x1)
      0x003110a3, // sh x3, 1(x2)
      0x00115283, // lhu x5, 1(x2): outside the RAM window
      0x00412023, // sw x4, 0(x2)
      0x00100073, // ebreak
    ];
    words.forEach((word, index) => code.store(index * 4, 4, word));
    const hart = new Hart(bus, direct ? code : undefined);
    hart.reset(code.base);
    expect(hart.run(8)).toEqual({ kind: "budget" });
    expect(hart.x[4]).toBe(-128);
    expect(hart.x[5]).toBe(0xff80);
    expect(code.load(65, 4)).toBe(0xffffff80);
    expect(data.load(0, 4)).toBe(0xffffff80);
    expect(hart.instret).toBe(8);
    expect(hart.step()).toMatchObject({
      kind: "fatal",
      message: expect.stringContaining("ebreak"),
    });
    expect(hart.instret).toBe(8);
    expect(hart.pc).toBe(0x1020);
  });

  it.each(["load", "store"])("preserves state when a %s crosses the RAM mapping", (access) => {
    const bus = new PhysicalBus();
    const ram = new Ram(0x1000, 16);
    bus.map(ram.base, ram);
    ram.store(0, 4, access === "load" ? 0x0000a103 : 0x0020a023); // lw x2, 0(x1) / sw x2, 0(x1)
    const hart = new Hart(bus, ram);
    hart.reset(ram.base);
    hart.x[1] = 0x100f;
    hart.x[2] = -1;
    expect(hart.run(1)).toMatchObject({ kind: "fatal", message: expect.stringContaining("Bus") });
    expect(hart.pc).toBe(ram.base);
    expect(hart.instret).toBe(0);
    expect(hart.x[2]).toBe(-1);
    expect(ram.bytes[15]).toBe(0);
  });
});
