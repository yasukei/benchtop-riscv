import type { MachineToUiMessage, UiToMachineMessage } from "@benchtop-riscv/core";
import { describe, expect, it } from "vitest";
import { MachineClient, type ClientEvent, type MachineWorker } from "./machine-client.js";

class FakeWorker implements MachineWorker {
  readonly sent: UiToMachineMessage[] = [];
  readonly transfers: (Transferable[] | undefined)[] = [];
  readonly listeners = new Map<string, Set<EventListener>>();
  terminated = false;

  postMessage(message: UiToMachineMessage, transfer?: Transferable[]): void {
    this.sent.push(message);
    this.transfers.push(transfer);
  }
  addEventListener(type: string, listener: EventListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  }
  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }
  terminate(): void {
    this.terminated = true;
  }
  dispatch(type: string, data?: MachineToUiMessage): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data } as MessageEvent);
  }
}

describe("MachineClient", () => {
  it("forwards messages in both directions", () => {
    const worker = new FakeWorker();
    const client = new MachineClient(worker);
    const events: ClientEvent[] = [];
    client.subscribe((event) => events.push(event));

    client.send({ type: "hello" });
    worker.dispatch("message", { type: "ready", isa: "rv32i" });

    expect(worker.sent).toEqual([{ type: "hello" }]);
    expect(events).toEqual([{ type: "ready", isa: "rv32i" }]);
  });

  it("transfers ELF buffers and forwards execution commands and responses", () => {
    const worker = new FakeWorker();
    const client = new MachineClient(worker);
    const events: ClientEvent[] = [];
    client.subscribe((event) => events.push(event));
    const image = new ArrayBuffer(16);
    const commands: UiToMachineMessage[] = [
      { type: "load", name: "test.elf", image },
      { type: "run" },
      { type: "pause" },
      { type: "step", count: 2 },
      { type: "reset" },
    ];
    commands.forEach((command) => client.send(command));
    expect(worker.sent).toEqual(commands);
    expect(worker.transfers).toEqual([[image], undefined, undefined, undefined, undefined]);
    // Model the structured clone that postMessage performs in a real Worker.
    const received = structuredClone(worker.sent[0], { transfer: worker.transfers[0] });
    expect(image.byteLength).toBe(0);
    expect(received).toMatchObject({ type: "load", name: "test.elf" });
    if (received?.type === "load") expect(received.image.byteLength).toBe(16);
    const messages: MachineToUiMessage[] = [
      {
        type: "state",
        status: "paused",
        pc: 0x8000_0004,
        x: Array(32).fill(0),
        instret: 1,
        instruction: undefined,
        stopReason: { kind: "budget" },
      },
      { type: "loadError", code: "bad-magic", message: "Missing ELF magic" },
    ];
    messages.forEach((message) => worker.dispatch("message", message));
    expect(events).toEqual(messages);
  });

  it("reports Worker errors as connection errors", () => {
    const worker = new FakeWorker();
    const client = new MachineClient(worker);
    const events: ClientEvent[] = [];
    client.subscribe((event) => events.push(event));

    worker.dispatch("error");
    worker.dispatch("messageerror");

    expect(events).toEqual([{ type: "connectionError" }, { type: "connectionError" }]);
  });

  it("stops delivering events after unsubscribe and close", () => {
    const worker = new FakeWorker();
    const client = new MachineClient(worker);
    const events: ClientEvent[] = [];
    const unsubscribe = client.subscribe((event) => events.push(event));

    unsubscribe();
    worker.dispatch("message", { type: "ready", isa: "rv32i" });
    client.close();

    expect(events).toEqual([]);
    expect(worker.terminated).toBe(true);
    expect([...worker.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });
});
