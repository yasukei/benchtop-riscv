import { describe, expect, it } from "vitest";
import type { ClientEvent } from "./machine-client.js";
import { nextConnection } from "./connection.js";

describe("nextConnection", () => {
  it("becomes ready with the reported ISA", () => {
    expect(nextConnection({ state: "connecting" }, { type: "ready", isa: "rv32i" })).toEqual({
      state: "ready",
      isa: "rv32i",
    });
  });

  const machineEvents: ClientEvent[] = [
    {
      type: "state",
      status: "loaded",
      pc: 0x8000_0000,
      x: Array(32).fill(0),
      instret: 0,
      instruction: undefined,
      stopReason: undefined,
    },
    { type: "loadError", code: "truncated", message: "Truncated image" },
  ];
  it.each(machineEvents)("keeps the connection status on $type", (event) => {
    const connection = { state: "ready", isa: "rv32i" } as const;
    expect(nextConnection(connection, event)).toBe(connection);
  });

  it("becomes an error on a connection error", () => {
    expect(nextConnection({ state: "ready", isa: "rv32i" }, { type: "connectionError" })).toEqual({
      state: "error",
    });
  });
});
