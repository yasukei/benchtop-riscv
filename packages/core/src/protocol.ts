// Messages between the UI thread and the machine Worker (ADR 0004). Every message is plain,
// structured-cloneable data. Image buffers are transferred to the Worker.

import type { StopReason } from "./stop-reason.js";

export type MachineStatus = "empty" | "loaded" | "running" | "paused" | "halted" | "fault";

/** A snapshot, with zeroed registers and PC before an image is loaded. */
export interface MachineState {
  status: MachineStatus;
  pc: number;
  x: number[];
  instret: number;
  instruction: number | undefined;
  stopReason: StopReason | undefined;
}

/** Sent by the UI to the machine Worker. */
export type UiToMachineMessage =
  | { type: "hello" }
  | { type: "load"; name: string; image: ArrayBuffer }
  | { type: "run" }
  | { type: "pause" }
  | { type: "step"; count: number }
  | { type: "reset" };

/** Sent by the machine Worker to the UI. */
export type MachineToUiMessage =
  | { type: "ready"; isa: string }
  | ({ type: "state" } & MachineState)
  | { type: "loadError"; code: string; message: string };
