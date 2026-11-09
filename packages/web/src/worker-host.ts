import type { MachineToUiMessage, UiToMachineMessage } from "@benchtop-riscv/core";

/** The ISA the machine implements; it grows with the milestones. */
export const supportedIsa = "rv32i";

/** Handles messages inside the machine Worker. Kept free of Worker globals for unit tests. */
export function createWorkerHost(post: (message: MachineToUiMessage) => void) {
  return {
    handle(message: UiToMachineMessage): void {
      switch (message.type) {
        case "hello":
          post({ type: "ready", isa: supportedIsa });
          return;
      }
    },
  };
}
