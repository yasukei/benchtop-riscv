import { describe, expect, it } from "vitest";
import { nextConnection } from "./connection.js";

describe("nextConnection", () => {
  it("becomes ready with the reported ISA", () => {
    expect(nextConnection({ state: "connecting" }, { type: "ready", isa: "rv32i" })).toEqual({
      state: "ready",
      isa: "rv32i",
    });
  });

  it("becomes an error on a connection error", () => {
    expect(nextConnection({ state: "ready", isa: "rv32i" }, { type: "connectionError" })).toEqual({
      state: "error",
    });
  });
});
