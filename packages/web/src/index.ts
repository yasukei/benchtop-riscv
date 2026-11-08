/** Stable package identity. */
export const packageName = "@benchtop-riscv/web";
export { MachineClient } from "./machine-client.js";
export type { ClientEvent, MachineWorker } from "./machine-client.js";
export { nextConnection } from "./connection.js";
export type { Connection } from "./connection.js";
export { createWorkerHost, supportedIsa } from "./worker-host.js";
