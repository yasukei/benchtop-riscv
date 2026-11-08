import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@benchtop-riscv/machine", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@benchtop-riscv/machine");
  });
});
