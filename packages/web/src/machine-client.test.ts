import type { MachineToUiMessage, UiToMachineMessage } from "@benchtop-riscv/core";
import { describe, expect, it } from "vitest";
import { MachineClient, type ClientEvent, type MachineWorker } from "./machine-client.js";

class FakeWorker implements MachineWorker {
  readonly sent: UiToMachineMessage[] = [];
  readonly listeners = new Map<string, Set<EventListener>>();
  terminated = false;

  postMessage(message: UiToMachineMessage): void {
    this.sent.push(message);
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
