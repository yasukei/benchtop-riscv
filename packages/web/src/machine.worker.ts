import type { UiToMachineMessage } from "@benchtop-riscv/core";
import { createWorkerHost } from "./worker-host.js";

const host = createWorkerHost((message) => postMessage(message));

addEventListener("message", (event: MessageEvent<UiToMachineMessage>) => host.handle(event.data));
