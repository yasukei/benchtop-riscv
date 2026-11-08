import type { MachineToUiMessage, UiToMachineMessage } from "@benchtop-riscv/core";

/** The small Worker surface used by the client, also implemented by test doubles. */
export interface MachineWorker {
  postMessage(message: UiToMachineMessage): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  terminate(): void;
}

export type ClientEvent = MachineToUiMessage | { type: "connectionError" };

/** Talks to the machine Worker and fans its messages out to subscribers. */
export class MachineClient {
  private readonly listeners = new Set<(event: ClientEvent) => void>();
  private readonly onMessage: EventListener = (event) => {
    this.emit((event as MessageEvent<MachineToUiMessage>).data);
  };
  private readonly onError: EventListener = () => {
    this.emit({ type: "connectionError" });
  };

  constructor(private readonly worker: MachineWorker) {
    worker.addEventListener("message", this.onMessage);
    worker.addEventListener("error", this.onError);
    worker.addEventListener("messageerror", this.onError);
  }

  subscribe(listener: (event: ClientEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  send(message: UiToMachineMessage): void {
    this.worker.postMessage(message);
  }

  close(): void {
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.removeEventListener("error", this.onError);
    this.worker.removeEventListener("messageerror", this.onError);
    this.worker.terminate();
    this.listeners.clear();
  }

  private emit(event: ClientEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
