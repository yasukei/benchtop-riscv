import type {
  MachineStatus,
  MachineToUiMessage,
  StopReason,
  UiToMachineMessage,
} from "@benchtop-riscv/core";
import { ElfError, parseElf } from "@benchtop-riscv/elf";
import type { ElfFile } from "@benchtop-riscv/elf";
import { createTestBoard, LoadError } from "@benchtop-riscv/machine";
import type { TestBoard } from "@benchtop-riscv/machine";

/** The ISA the machine implements; it grows with the milestones. */
export const supportedIsa = "rv32i";
const sliceBudget = 10_000;
const stateIntervalMs = 100;

/** schedule must enqueue a later task, allowing incoming Worker messages between slices. */
export interface WorkerScheduler {
  schedule(task: () => void): void;
  now(): number;
}

/** Handles messages inside the machine Worker. Kept free of Worker globals for unit tests. */
export function createWorkerHost(
  post: (message: MachineToUiMessage) => void,
  scheduler: WorkerScheduler,
) {
  let board: TestBoard | undefined;
  let lastElf: ElfFile | undefined;
  let status: MachineStatus = "empty";
  let stopReason: StopReason | undefined;
  let generation = 0;
  let lastStateAt = -Infinity;

  function postState(): void {
    const hart = board?.hart;
    post({
      type: "state",
      status,
      pc: hart?.pc ?? 0,
      x: hart ? Array.from(hart.x) : Array<number>(32).fill(0),
      instret: hart?.instret ?? 0,
      instruction: hart ? board?.readWord(hart.pc) : undefined,
      stopReason,
    });
    lastStateAt = scheduler.now();
  }

  function execute(count: number): void {
    stopReason = board!.run(count);
    switch (stopReason.kind) {
      case "halt":
        status = "halted";
        break;
      case "fatal":
        status = "fault";
        break;
      case "breakpoint":
        status = "paused";
        break;
      case "budget":
        break;
    }
  }

  function scheduleSlice(): void {
    const token = generation;
    scheduler.schedule(() => {
      // A pause, reset or successful load invalidates already queued work, even
      // if another run command has started execution again in the meantime.
      if (token !== generation || status !== "running") return;
      execute(sliceBudget);
      if (status !== "running" || scheduler.now() - lastStateAt >= stateIntervalMs) postState();
      if (status === "running") scheduleSlice();
    });
  }

  return {
    handle(message: UiToMachineMessage): void {
      switch (message.type) {
        case "hello":
          post({ type: "ready", isa: supportedIsa });
          return;
        case "load": {
          try {
            const elf = parseElf(new Uint8Array(message.image));
            const target = board ?? createTestBoard();
            // The board validates before changing RAM, preserving a running
            // program and its reset image when a replacement is rejected.
            target.load(elf);
            board = target;
            lastElf = elf;
          } catch (error) {
            if (!(error instanceof ElfError || error instanceof LoadError)) throw error;
            post({
              type: "loadError",
              code: error.code,
              message: `${message.name}: ${error.message}`,
            });
            postState();
            return;
          }
          generation++;
          status = "loaded";
          stopReason = undefined;
          break;
        }
        case "run":
          if (status === "loaded" || status === "paused") {
            status = "running";
            scheduleSlice();
          }
          break;
        case "pause":
          if (status === "running") {
            generation++;
            status = "paused";
          }
          break;
        case "step":
          if (
            (status === "loaded" || status === "paused") &&
            Number.isSafeInteger(message.count) &&
            message.count > 0
          ) {
            status = "paused";
            execute(message.count);
          }
          break;
        case "reset":
          if (board && lastElf) {
            generation++;
            board.load(lastElf);
            status = "loaded";
            stopReason = undefined;
          }
          break;
      }
      postState();
    },
  };
}
