import type { MachineToUiMessage, UiToMachineMessage } from "@benchtop-riscv/core";
import { afterEach, expect, it, vi } from "vitest";

const NativeMessageChannel = MessageChannel;
const channels: MessageChannel[] = [];

afterEach(() => {
  for (const channel of channels) {
    channel.port1.onmessage = null;
    channel.port2.onmessage = null;
    channel.port1.close();
    channel.port2.close();
  }
  channels.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** ELF32 with one PT_LOAD segment containing jal x0, 0. */
function loopImage(): ArrayBuffer {
  const image = new ArrayBuffer(88);
  const bytes = new Uint8Array(image);
  const view = new DataView(image);
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1]);
  view.setUint16(16, 2, true);
  view.setUint16(18, 243, true);
  view.setUint32(20, 1, true);
  view.setUint32(24, 0x8000_0000, true);
  view.setUint32(28, 52, true);
  view.setUint16(40, 52, true);
  view.setUint16(42, 32, true);
  view.setUint16(44, 1, true);
  view.setUint32(52, 1, true);
  view.setUint32(56, 84, true);
  view.setUint32(60, 0x8000_0000, true);
  view.setUint32(64, 0x8000_0000, true);
  view.setUint32(68, 4, true);
  view.setUint32(72, 4, true);
  view.setUint32(76, 5, true);
  view.setUint32(84, 0x0000006f, true);
  return image;
}

it("runs and handles an incoming pause without timer callbacks", async () => {
  // Model Worker globals while using real message tasks. Frozen timers ensure
  // a return to setTimeout scheduling cannot silently bring back the clamp.
  vi.useFakeTimers({ toFake: ["setTimeout"] });
  vi.stubGlobal(
    "MessageChannel",
    class extends NativeMessageChannel {
      constructor() {
        super();
        channels.push(this);
      }
    },
  );
  let handle: ((event: MessageEvent<UiToMachineMessage>) => void) | undefined;
  vi.stubGlobal("addEventListener", (type: string, listener: typeof handle) => {
    if (type === "message") handle = listener;
  });
  const commands = new NativeMessageChannel();
  channels.push(commands);
  commands.port1.onmessage = (event: MessageEvent<UiToMachineMessage>) => handle!(event);
  const posted: MachineToUiMessage[] = [];
  let pauseRequested = false;
  const stopped = new Promise<MachineToUiMessage>((resolve) => {
    vi.stubGlobal("postMessage", (message: MachineToUiMessage) => {
      posted.push(message);
      if (message.type !== "state") return;
      if (message.status === "running" && message.instret > 0 && !pauseRequested) {
        pauseRequested = true;
        commands.port2.postMessage({ type: "pause" } satisfies UiToMachineMessage);
      }
      if (message.status === "paused") resolve(message);
    });
  });
  await import("./machine.worker.js");
  commands.port2.postMessage({
    type: "load",
    name: "loop.elf",
    image: loopImage(),
  } satisfies UiToMachineMessage);
  commands.port2.postMessage({ type: "run" } satisfies UiToMachineMessage);
  const state = await stopped;
  expect(state).toMatchObject({
    type: "state",
    status: "paused",
    pc: 0x8000_0000,
    stopReason: { kind: "budget" },
  });
  if (state.type === "state") expect(state.instret).toBeGreaterThan(0);
  expect(posted).toContainEqual(expect.objectContaining({ type: "state", status: "loaded" }));
  expect(vi.getTimerCount()).toBe(0);
});
