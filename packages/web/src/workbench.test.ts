import type { MachineState, MachineStatus, UiToMachineMessage } from "@benchtop-riscv/core";
import { describe, expect, it, vi } from "vitest";
import type { ClientEvent } from "./machine-client.js";
import { controlsFor, describeStatus, formatHex, registerRows, Workbench } from "./workbench.js";

function state(overrides: Partial<MachineState> = {}): MachineState {
  return {
    status: "loaded",
    pc: 0x8000_0000,
    x: Array<number>(32).fill(0),
    instret: 0,
    instruction: 0x13,
    stopReason: undefined,
    ...overrides,
  };
}

function setup() {
  let receive: (event: ClientEvent) => void = () => {};
  const send = vi.fn<(message: UiToMachineMessage) => void>();
  const unsubscribe = vi.fn();
  const workbench = new Workbench({
    send,
    subscribe: (listener) => {
      receive = listener;
      return unsubscribe;
    },
  });
  const disconnect = workbench.connect();
  const emit = (event: ClientEvent) => receive(event);
  emit({ type: "ready", isa: "rv32i" });
  const snapshot = (overrides: Partial<MachineState> = {}) =>
    emit({ type: "state", ...state(overrides) });
  const file = { name: "add.elf", arrayBuffer: async () => new ArrayBuffer(8) };
  return { workbench, emit, snapshot, send, disconnect, unsubscribe, file };
}

describe("enabling rules", () => {
  const cases: [MachineStatus, boolean[]][] = [
    ["empty", [true, false, false, false, false]],
    ["loaded", [true, true, false, true, true]],
    ["running", [false, false, true, false, true]],
    ["paused", [true, true, false, true, true]],
    ["halted", [true, false, false, false, true]],
    ["fault", [true, false, false, false, true]],
  ];
  it.each(cases)("enables applicable controls for %s", (status, expected) => {
    expect(Object.values(controlsFor(status, true, false))).toEqual(expected);
    expect(Object.values(controlsFor(status, false, false))).toEqual(Array(5).fill(false));
    expect(Object.values(controlsFor(status, true, true))).toEqual(Array(5).fill(false));
  });
});

describe("register and instruction presentation", () => {
  it.each([
    [0, "0x00000000"],
    [0x8000_0000, "0x80000000"],
    [-1, "0xffffffff"],
    [0x1_0000_0001, "0x00000001"],
  ])("formats %i as a u32", (input, expected) => {
    expect(formatHex(input)).toBe(expected);
  });

  it("lists pc and all 32 registers with ABI names and no initial highlights", () => {
    const rows = registerRows(state());
    expect(rows).toHaveLength(33);
    expect(rows[0]).toEqual({ name: "pc", abi: "", value: "0x80000000", changed: false });
    expect(rows[1]).toEqual({ name: "x0", abi: "zero", value: "0x00000000", changed: false });
    expect(rows[11]?.abi).toBe("a0");
    expect(rows[33 - 1]?.abi).toBe("t6");
    expect(rows.every((row) => !row.changed)).toBe(true);
    expect(registerRows().every((row) => row.value === "—" && !row.changed)).toBe(true);
  });

  it("compares unsigned values with the immediately preceding snapshot", () => {
    const before = state();
    const after = state({ pc: 0x8000_0004 });
    after.x[10] = -1;
    const changed = registerRows(after, before).filter((row) => row.changed);
    expect(changed.map((row) => row.name)).toEqual(["pc", "x10"]);
    expect(changed[1]?.value).toBe("0xffffffff");
    expect(registerRows(after, after).every((row) => !row.changed)).toBe(true);
    before.x[10] = 0xffff_ffff;
    expect(registerRows(after, before)[11]?.changed).toBe(false);
  });

  it("describes pass, nonzero exits and faults", () => {
    expect(describeStatus()).toBe("empty");
    expect(
      describeStatus(state({ status: "halted", stopReason: { kind: "halt", exitCode: 0 } })),
    ).toBe("halted · exit code 0 (pass)");
    expect(
      describeStatus(state({ status: "halted", stopReason: { kind: "halt", exitCode: 7 } })),
    ).toBe("halted · exit code 7");
    expect(
      describeStatus(state({ status: "fault", stopReason: { kind: "fatal", message: "Bad PC" } })),
    ).toBe("fault · Bad PC");
  });
});

describe("Workbench", () => {
  it("loads a file, waits for acknowledgement and sends only applicable commands", async () => {
    const { workbench, file, send, snapshot } = setup();
    workbench.command("run");
    expect(send.mock.calls).toEqual([[{ type: "hello" }]]);
    await workbench.loadFile(file);
    expect(send).toHaveBeenLastCalledWith({
      type: "load",
      name: "add.elf",
      image: expect.any(ArrayBuffer),
    });
    expect(workbench.getSnapshot().loading).toBe(true);
    expect(workbench.getSnapshot().controls.step).toBe(false);
    snapshot();
    expect(workbench.getSnapshot()).toMatchObject({
      fileName: "add.elf",
      loading: false,
      instruction: "0x80000000: 0x00000013  nop",
    });
    workbench.command("step");
    workbench.command("step");
    expect(send.mock.calls.filter(([message]) => message.type === "step")).toHaveLength(1);
    expect(send).toHaveBeenLastCalledWith({ type: "step", count: 1 });
    snapshot({ status: "paused", pc: 0x8000_0004, instret: 1 });
    expect(workbench.getSnapshot().registers[0]?.changed).toBe(true);
    workbench.command("run");
    expect(send).toHaveBeenLastCalledWith({ type: "run" });
    snapshot({ status: "running" });
    workbench.command("pause");
    expect(send).toHaveBeenLastCalledWith({ type: "pause" });
    snapshot({ status: "paused" });
    expect(workbench.getSnapshot().registers.every((row) => !row.changed)).toBe(true);
    workbench.command("reset");
    expect(send).toHaveBeenLastCalledWith({ type: "reset" });
  });

  it("preserves the loaded name and a load error across the following state", async () => {
    const { workbench, file, emit, snapshot } = setup();
    await workbench.loadFile(file);
    snapshot();
    await workbench.loadFile({ ...file, name: "bad.elf" });
    emit({ type: "loadError", code: "bad-magic", message: "bad.elf: Missing ELF magic" });
    snapshot();
    expect(workbench.getSnapshot()).toMatchObject({
      fileName: "add.elf",
      loadError: "bad.elf: Missing ELF magic",
      loading: false,
    });
    expect(workbench.getSnapshot().controls.step).toBe(true);
    workbench.command("reset");
    snapshot();
    expect(workbench.getSnapshot().loadError).toBe("");
  });

  it("blocks overlapping file reads and recovers from a read failure", async () => {
    const { workbench, file, send } = setup();
    let rejectRead: (reason: Error) => void = () => {};
    const read = new Promise<ArrayBuffer>((_, reject) => {
      rejectRead = reject;
    });
    const pending = workbench.loadFile({ name: "unreadable", arrayBuffer: () => read });
    await workbench.loadFile(file);
    expect(send).toHaveBeenCalledTimes(1);
    rejectRead(new Error("Access denied"));
    await pending;
    expect(workbench.getSnapshot()).toMatchObject({
      loading: false,
      loadError: "unreadable: Access denied",
    });
    expect(workbench.getSnapshot().controls.load).toBe(true);
  });

  it("disables controls after a Worker failure and does not send a pending file", async () => {
    const { workbench, file, emit, send } = setup();
    const pending = workbench.loadFile(file);
    emit({ type: "connectionError" });
    await pending;
    expect(workbench.getSnapshot().connection).toBe("Worker error");
    expect(Object.values(workbench.getSnapshot().controls)).toEqual(Array(5).fill(false));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not send file data after disconnect and unsubscribes listeners", async () => {
    const { workbench, file, disconnect, unsubscribe, send } = setup();
    const listener = vi.fn();
    const stop = workbench.subscribe(listener);
    const pending = workbench.loadFile(file);
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    disconnect();
    await pending;
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("shows an unavailable instruction without disassembling an absent word", () => {
    const { workbench, snapshot } = setup();
    snapshot({ instruction: undefined });
    expect(workbench.getSnapshot().instruction).toBe("0x80000000: unavailable");
  });
});
