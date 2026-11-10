/** Stable package identity. */
export const packageName = "@benchtop-riscv/core";
export { BusError } from "./bus.js";
export type { AccessSize, Bus, Device, RamWindow } from "./bus.js";
export type { StopReason } from "./stop-reason.js";
export type {
  MachineState,
  MachineStatus,
  MachineToUiMessage,
  UiToMachineMessage,
} from "./protocol.js";
