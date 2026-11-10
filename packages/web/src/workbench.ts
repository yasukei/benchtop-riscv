import type { MachineState, MachineStatus, UiToMachineMessage } from "@benchtop-riscv/core";
import { disassemble } from "@benchtop-riscv/riscv";
import { nextConnection, type Connection } from "./connection.js";
import type { ClientEvent, MachineClient } from "./machine-client.js";

export type Command = "run" | "pause" | "step" | "reset";

export function controlsFor(status: MachineStatus, available: boolean, busy: boolean) {
  const enabled = available && !busy;
  return {
    load: enabled && status !== "running",
    run: enabled && (status === "loaded" || status === "paused"),
    pause: enabled && status === "running",
    step: enabled && (status === "loaded" || status === "paused"),
    reset: enabled && status !== "empty",
  };
}

export function formatHex(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

const abiNames = [
  "zero",
  "ra",
  "sp",
  "gp",
  "tp",
  "t0",
  "t1",
  "t2",
  "s0",
  "s1",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
  "s11",
  "t3",
  "t4",
  "t5",
  "t6",
];

export function registerRows(state?: MachineState, previous?: MachineState) {
  const row = (name: string, abi: string, value?: number, before?: number) => ({
    name,
    abi,
    value: value === undefined ? "—" : formatHex(value),
    changed: value !== undefined && before !== undefined && value >>> 0 !== before >>> 0,
  });
  return [
    row("pc", "", state?.pc, previous?.pc),
    ...abiNames.map((abi, index) => row(`x${index}`, abi, state?.x[index], previous?.x[index])),
  ];
}

export function describeStatus(state?: MachineState): string {
  if (!state) return "empty";
  if (state.status === "halted" && state.stopReason?.kind === "halt") {
    const code = state.stopReason.exitCode;
    return `halted · exit code ${code}${code === 0 ? " (pass)" : ""}`;
  }
  if (state.status === "fault" && state.stopReason?.kind === "fatal") {
    return `fault · ${state.stopReason.message}`;
  }
  return state.status;
}

function connectionText(connection: Connection): string {
  switch (connection.state) {
    case "connecting":
      return "Connecting";
    case "ready":
      return `Ready (${connection.isa})`;
    case "error":
      return "Worker error";
  }
}

/** Owns UI transitions and async file reads; React only renders its cached view. */
export class Workbench {
  private connection: Connection = { state: "connecting" };
  private state: MachineState | undefined;
  private previous: MachineState | undefined;
  private pending: "reading" | "load" | "command" | undefined;
  private pendingName = "";
  private fileName = "";
  private loadError = "";
  private active = false;
  private readonly listeners = new Set<() => void>();
  private view = this.createView();

  constructor(private readonly client: Pick<MachineClient, "send" | "subscribe">) {}

  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  connect(): () => void {
    this.active = true;
    const unsubscribe = this.client.subscribe((event) => this.receive(event));
    this.client.send({ type: "hello" });
    return () => {
      this.active = false;
      unsubscribe();
    };
  }

  async loadFile(file: Pick<File, "name" | "arrayBuffer"> | undefined): Promise<void> {
    if (!file || !this.view.controls.load) return;
    this.pending = "reading";
    this.pendingName = file.name;
    this.loadError = "";
    this.publish();
    try {
      const image = await file.arrayBuffer();
      if (!this.active || this.connection.state !== "ready") return;
      this.pending = "load";
      this.client.send({ type: "load", name: file.name, image });
    } catch (error) {
      if (!this.active) return;
      this.pending = undefined;
      this.loadError = `${file.name}: ${error instanceof Error ? error.message : "Cannot read file"}`;
      this.publish();
    }
  }

  command(command: Command): void {
    if (!this.view.controls[command]) return;
    this.pending = "command";
    this.loadError = "";
    this.publish();
    const message: UiToMachineMessage =
      command === "step" ? { type: "step", count: 1 } : { type: command };
    this.client.send(message);
  }

  private receive(event: ClientEvent): void {
    this.connection = nextConnection(this.connection, event);
    switch (event.type) {
      case "state":
        this.previous = this.state;
        this.state = event;
        if (this.pending === "load") this.fileName = this.pendingName;
        this.pending = undefined;
        break;
      case "loadError":
        this.loadError = event.message;
        this.pending = undefined;
        break;
      case "connectionError":
        this.pending = undefined;
        break;
      case "ready":
        break;
    }
    this.publish();
  }

  private createView() {
    const state = this.state;
    return {
      connection: connectionText(this.connection),
      fileName: this.fileName || "No ELF loaded",
      loading: this.pending === "reading" || this.pending === "load",
      loadError: this.loadError,
      status: describeStatus(state),
      instret: String(state?.instret ?? 0),
      controls: controlsFor(
        state?.status ?? "empty",
        this.connection.state === "ready",
        !!this.pending,
      ),
      registers: registerRows(state, this.previous),
      instruction:
        state && state.status !== "empty"
          ? `${formatHex(state.pc)}: ${state.instruction === undefined ? "unavailable" : `${formatHex(state.instruction)}  ${disassemble(state.instruction, state.pc)}`}`
          : "No instruction",
    };
  }

  private publish(): void {
    this.view = this.createView();
    for (const listener of this.listeners) listener();
  }
}
