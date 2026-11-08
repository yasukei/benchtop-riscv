import type { MachineToUiMessage } from "@benchtop-riscv/core";
import { describe, expect, it } from "vitest";
import { createWorkerHost, supportedIsa } from "./worker-host.js";

describe("createWorkerHost", () => {
  it("answers hello with ready and the supported ISA", () => {
    const posted: MachineToUiMessage[] = [];
    createWorkerHost((message) => posted.push(message)).handle({ type: "hello" });
    expect(posted).toEqual([{ type: "ready", isa: supportedIsa }]);
  });
});
