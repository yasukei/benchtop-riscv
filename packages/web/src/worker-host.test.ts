import type { MachineToUiMessage, StopReason, UiToMachineMessage } from "@benchtop-riscv/core";
import * as machine from "@benchtop-riscv/machine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkerHost, supportedIsa, type WorkerScheduler } from "./worker-host.js";

const base = 0x8000_0000;
const loop = 0x0000006f;
const increment = 0x00108093; // addi x1, x1, 1

type State = Extract<MachineToUiMessage, { type: "state" }>;

/** A real ELF32 file: code and BSS in one segment, with optional HTIF symbols. */
function makeElf(
  options: { words?: number[]; htif?: boolean; address?: number } = {},
): ArrayBuffer {
  const image = new ArrayBuffer(768);
  const bytes = new Uint8Array(image);
  const view = new DataView(image);
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  const words = options.words ?? [increment, increment, increment, loop];
  const address = options.address ?? base;
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1]);
  u16(16, 2);
  u16(18, 243);
  u32(20, 1);
  u32(24, address);
  u32(28, 52);
  u16(40, 52);
  u16(42, 32);
  u16(44, 1);
  u32(52, 1); // PT_LOAD
  u32(56, 128);
  u32(60, address);
  u32(64, address);
  u32(68, words.length * 4);
  u32(72, 512);
  u32(76, 7);
  words.forEach((word, index) => u32(128 + index * 4, word));
  if (options.htif) {
    u32(32, 512);
    u16(46, 40);
    u16(48, 3);
    u32(556, 2); // SHT_SYMTAB
    u32(568, 384);
    u32(572, 32);
    u32(576, 2);
    u32(588, 16);
    u32(596, 3); // SHT_STRTAB
    u32(608, 448);
    u32(612, 8);
    bytes.set([0, ...Array.from("tohost\0", (c) => c.charCodeAt(0))], 448);
    u32(400, 1);
    u32(404, base + 0x100);
    u32(408, 8);
  }
  return image;
}

class FakeScheduler implements WorkerScheduler {
  readonly tasks: (() => void)[] = [];
  time = 0;
  schedule(task: () => void): void {
    this.tasks.push(task);
  }
  now(): number {
    return this.time;
  }
  tick(elapsed = 0): void {
    this.time += elapsed;
    const task = this.tasks.shift();
    expect(task).toBeDefined();
    task!();
  }
}

function setup() {
  const posted: MachineToUiMessage[] = [];
  const scheduler = new FakeScheduler();
  const host = createWorkerHost((message) => posted.push(message), scheduler);
  return {
    host,
    posted,
    scheduler,
    load(image = makeElf()) {
      host.handle({ type: "load", name: "test.elf", image });
    },
    state(): State {
      const state = posted.findLast((message): message is State => message.type === "state");
      expect(state).toBeDefined();
      return state!;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("createWorkerHost", () => {
  it("answers hello with ready and the supported ISA", () => {
    const { host, posted } = setup();
    host.handle({ type: "hello" });
    expect(posted).toEqual([{ type: "ready", isa: supportedIsa }]);
  });

  it("loads a real ELF and snapshots all registers and the next instruction", () => {
    const { load, state } = setup();
    load();
    expect(state()).toEqual({
      type: "state",
      status: "loaded",
      pc: base,
      x: Array(32).fill(0),
      instret: 0,
      instruction: increment,
      stopReason: undefined,
    });
  });

  it.each([0, 3])("runs in scheduled slices until HTIF halts with exit code %i", (exitCode) => {
    const { host, load, state, scheduler } = setup();
    // LUI base; ADDI result; SW result to tohost; JAL loop.
    load(
      makeElf({
        htif: true,
        words: [0x800000b7, ((exitCode * 2 + 1) << 20) | 0x113, 0x1020a023, loop],
      }),
    );
    host.handle({ type: "run" });
    expect(state()).toMatchObject({ status: "running", instret: 0 });
    scheduler.tick();
    expect(state()).toMatchObject({
      status: "halted",
      instret: 10_000,
      stopReason: { kind: "halt", exitCode },
    });
    expect(scheduler.tasks).toHaveLength(0);
    host.handle({ type: "run" });
    host.handle({ type: "step", count: 1 });
    expect(state().instret).toBe(10_000);
    expect(scheduler.tasks).toHaveLength(0);
  });

  it("steps by the requested count and keeps previous snapshots independent", () => {
    const { host, load, state } = setup();
    load();
    const loaded = state();
    host.handle({ type: "step", count: 2 });
    expect(state()).toMatchObject({
      status: "paused",
      pc: base + 8,
      instret: 2,
      instruction: increment,
      stopReason: { kind: "budget" },
    });
    expect(state().x[1]).toBe(2);
    host.handle({ type: "step", count: 1 });
    expect(state()).toMatchObject({ pc: base + 12, instret: 3, instruction: loop });
    expect(loaded.x).toEqual(Array(32).fill(0));
  });

  it("pauses between slices and resumes without reviving an old queued slice", () => {
    const { host, load, state, scheduler } = setup();
    load();
    host.handle({ type: "run" });
    scheduler.tick(100);
    expect(state().instret).toBe(10_000);
    host.handle({ type: "pause" });
    expect(state().status).toBe("paused");
    host.handle({ type: "run" });
    scheduler.tick(100); // The slice queued before pause is stale.
    expect(state().instret).toBe(10_000);
    scheduler.tick(100);
    expect(state().instret).toBe(20_000);
    host.handle({ type: "pause" });
    scheduler.tick();
    expect(state()).toMatchObject({ status: "paused", instret: 20_000 });
    expect(scheduler.tasks).toHaveLength(0);
  });

  it("limits periodic running snapshots to 100 ms and ignores duplicate run and step", () => {
    const { host, posted, load, state, scheduler } = setup();
    load();
    host.handle({ type: "run" });
    host.handle({ type: "run" });
    host.handle({ type: "step", count: 5 });
    expect(scheduler.tasks).toHaveLength(1);
    expect(state().instret).toBe(0);
    const count = posted.length;
    scheduler.tick(40);
    scheduler.tick(59);
    expect(posted).toHaveLength(count);
    scheduler.tick(1);
    expect(posted).toHaveLength(count + 1);
    expect(state()).toMatchObject({ status: "running", instret: 30_000 });
    scheduler.tick(99);
    expect(posted).toHaveLength(count + 1);
    scheduler.tick(1);
    expect(posted).toHaveLength(count + 2);
  });

  it("yields after fixed attempts even when every instruction traps", () => {
    const { host, load, state, scheduler } = setup();
    load(makeElf({ words: [0xffff_ffff] }));
    host.handle({ type: "run" });
    scheduler.tick(100);
    expect(state()).toMatchObject({
      status: "running",
      instret: 0,
      pc: 0,
      instruction: undefined,
      stopReason: { kind: "budget" },
    });
    expect(scheduler.tasks).toHaveLength(1);
    host.handle({ type: "pause" });
    expect(state().status).toBe("paused");
  });

  it.each(["reset", "load"] as const)(
    "%s cancels queued execution and restores the image",
    (command) => {
      const { host, load, state, scheduler } = setup();
      load();
      host.handle({ type: "step", count: 2 });
      host.handle({ type: "run" });
      if (command === "reset") host.handle({ type: "reset" });
      else load(makeElf({ words: [loop] }));
      expect(state()).toMatchObject({
        status: "loaded",
        pc: base,
        instret: 0,
        stopReason: undefined,
      });
      expect(state().x).toEqual(Array(32).fill(0));
      scheduler.tick();
      expect(scheduler.tasks).toHaveLength(0);
      expect(state().instret).toBe(0);
      expect(state().instruction).toBe(command === "reset" ? increment : loop);
    },
  );

  it("reset restores RAM and HTIF so a halted image can run again", () => {
    const { host, load, state, scheduler } = setup();
    load(makeElf({ htif: true, words: [0x800000b7, 0x00100113, 0x1020a023, loop] }));
    for (let i = 0; i < 2; i++) {
      host.handle({ type: "run" });
      scheduler.tick();
      expect(state()).toMatchObject({
        status: "halted",
        stopReason: { kind: "halt", exitCode: 0 },
      });
      host.handle({ type: "reset" });
      expect(state()).toMatchObject({
        status: "loaded",
        pc: base,
        instret: 0,
        stopReason: undefined,
      });
    }
  });

  it.each([
    { image: new ArrayBuffer(0), code: "truncated" },
    { image: new ArrayBuffer(52), code: "bad-magic" },
    { image: makeElf({ address: 0x1000 }), code: "segment-outside-ram" },
  ])("reports a typed loadError: $code", ({ image, code }) => {
    const { posted, load, state } = setup();
    load(image);
    expect(posted[0]).toMatchObject({
      type: "loadError",
      code,
      message: expect.stringContaining("test.elf:"),
    });
    expect(state().status).toBe("empty");
  });

  it("preserves execution and the reset image after a rejected replacement", () => {
    const { host, posted, load, state, scheduler } = setup();
    load();
    host.handle({ type: "run" });
    load(makeElf({ address: 0x1000 }));
    expect(posted.at(-2)).toMatchObject({ type: "loadError", code: "segment-outside-ram" });
    expect(state().status).toBe("running");
    scheduler.tick(100);
    expect(state().instret).toBe(10_000);
    host.handle({ type: "reset" });
    expect(state()).toMatchObject({
      status: "loaded",
      pc: base,
      instret: 0,
      instruction: increment,
    });
  });

  const ignored: UiToMachineMessage[] = [
    { type: "run" },
    { type: "pause" },
    { type: "step", count: 1 },
    { type: "reset" },
  ];
  it.each(ignored)("answers $type before load with the empty state", (message) => {
    const { host, posted, state, scheduler } = setup();
    host.handle(message);
    expect(posted).toHaveLength(1);
    expect(state()).toEqual({
      type: "state",
      status: "empty",
      pc: 0,
      x: Array(32).fill(0),
      instret: 0,
      instruction: undefined,
      stopReason: undefined,
    });
    expect(scheduler.tasks).toHaveLength(0);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "ignores invalid step count %s",
    (count) => {
      const { host, load, state } = setup();
      load();
      host.handle({ type: "step", count });
      expect(state()).toMatchObject({ status: "loaded", pc: base, instret: 0 });
    },
  );

  const stops: { reason: StopReason; status: string }[] = [
    { reason: { kind: "fatal", message: "Internal failure" }, status: "fault" },
    { reason: { kind: "breakpoint", pc: base }, status: "paused" },
  ];
  it.each(stops)("posts $status immediately when the board stops early", ({ reason, status }) => {
    const board = machine.createTestBoard();
    vi.spyOn(machine, "createTestBoard").mockReturnValue(board);
    // The current hart does not emit these variants; exercise the board contract.
    vi.spyOn(board, "run").mockReturnValue(reason);
    const { host, load, state, scheduler } = setup();
    load();
    host.handle({ type: "run" });
    scheduler.tick(1);
    expect(state()).toMatchObject({ status, stopReason: reason });
    expect(scheduler.tasks).toHaveLength(0);
    if (status === "fault") {
      host.handle({ type: "run" });
      host.handle({ type: "step", count: 1 });
      expect(board.run).toHaveBeenCalledTimes(1);
    }
  });
});
