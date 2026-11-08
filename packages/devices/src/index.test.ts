import { describe, expect, it } from "vitest";
import { packageName } from "./index.js";

describe("@benchtop-riscv/devices", () => {
  it("exposes its package identity", () => {
    expect(packageName).toBe("@benchtop-riscv/devices");
  });
});
