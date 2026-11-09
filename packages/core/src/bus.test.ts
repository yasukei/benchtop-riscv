import { describe, expect, it } from "vitest";
import { BusError } from "./bus.js";

describe("BusError", () => {
  it("formats the faulting address as eight hex digits", () => {
    const error = new BusError(0x8000_0000 | 0, "load");
    expect(error.address).toBe(0x8000_0000 | 0);
    expect(error.access).toBe("load");
    expect(error.message).toBe("Bus load fault at 0x80000000");
    expect(error).toBeInstanceOf(Error);
  });
});
