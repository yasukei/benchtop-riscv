import type { UiToMachineMessage } from "@benchtop-riscv/core";
import { createWorkerHost } from "./worker-host.js";

const host = createWorkerHost((message) => postMessage(message), {
  schedule: (task) => {
    setTimeout(task, 0);
  },
  now: () => performance.now(),
});

addEventListener("message", (event: MessageEvent<UiToMachineMessage>) => host.handle(event.data));
