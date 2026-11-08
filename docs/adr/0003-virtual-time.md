# 0003. Virtual time

- Status: Accepted
- Date: 2026-11-09

## Context

Timers (`mtime`, `mtimecmp`, cycle counters) drive interrupts and guest scheduling. If they
followed the host clock, test results would depend on host speed, single-stepping would let
timers fire unexpectedly, and failures would not reproduce.

## Decision

Emulator packages (`core`, `elf`, `riscv`, `devices`, `machine`) never read the host clock
and never use host timers. Emulated time is derived from the number of executed
instructions, with a board-defined ratio between instructions and `mtime` ticks. Only `web`
maps emulated time to real time, by choosing how many instructions to run per interval.
ESLint rejects `Date.now()`, `performance.now()`, `new Date()`, `setTimeout` and
`setInterval` in the emulator packages.

## Consequences

Every run of the same image with the same input is deterministic, so tests are exact and
fast. The guest's notion of time drifts from wall-clock time when the host is slow or the
UI throttles execution; the guest's real-time clock, if any, must be supplied explicitly.
