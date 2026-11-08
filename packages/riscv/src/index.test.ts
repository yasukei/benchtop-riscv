import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@benchtop-riscv/riscv", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@benchtop-riscv/riscv");
  });
});
