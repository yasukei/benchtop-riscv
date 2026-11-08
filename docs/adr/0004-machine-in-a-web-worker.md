# 0004. Machine in a Web Worker

- Status: Accepted
- Date: 2026-11-09

## Context

The machine executes millions of instructions per second. Running it on the main thread
would freeze the UI. Sharing memory between threads with `SharedArrayBuffer` requires
cross-origin isolation (COOP/COEP headers), which GitHub Pages cannot set.

## Decision

The machine runs in a dedicated module Web Worker. The UI and the Worker communicate only
through the message types in `core/src/protocol.ts`, which are plain structured-cloneable
data; large buffers (images, memory dumps) are sent as transferable `ArrayBuffer`s. The
Worker runs the machine in bounded slices (`run(budget)`) and handles incoming messages
between slices. `SharedArrayBuffer` is not used.

## Consequences

The UI stays responsive and the protocol can be tested with a fake Worker. Commands such as
pause take effect only at slice boundaries, so slice sizes must be small enough for a
responsive UI. The UI never reads guest memory directly; it asks the Worker for it.
