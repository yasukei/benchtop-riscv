import type { UiToMachineMessage } from "@benchtop-riscv/core";
import { createWorkerHost } from "./worker-host.js";

// Channel messages yield to the event loop without nested timers' 4 ms clamp.
const channel = new MessageChannel();
const tasks: (() => void)[] = [];
channel.port1.onmessage = () => tasks.shift()?.();

const host = createWorkerHost((message) => postMessage(message), {
  schedule: (task) => {
    tasks.push(task);
    channel.port2.postMessage(undefined);
  },
  now: () => performance.now(),
});

addEventListener("message", (event: MessageEvent<UiToMachineMessage>) => host.handle(event.data));
