import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@benchtop-riscv/elf", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@benchtop-riscv/elf");
  });
});
