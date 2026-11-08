# 0001. Monorepo packages and dependency direction

- Status: Accepted
- Date: 2026-11-09

## Context

The emulator must run in the browser and be testable in Node without a browser. The ISA,
devices, file formats, board wiring and UI change at different rates and are implemented by
coding agents in separate PRs, one issue each.

## Decision

Use a pnpm workspace with the packages `core`, `elf`, `riscv`, `devices`, `machine` and
`web`. Dependencies point inward: `web → machine → riscv | devices | elf → core`. `riscv`,
`devices` and `elf` do not depend on each other; they meet only through interfaces in `core`
and are wired together by `machine`. Only `web` may use DOM APIs. The direction is enforced
by dependency-cruiser in `pnpm lint`.

## Consequences

The hart can be tested without any device, and devices without a hart. Shared contracts live
in `core`, so changing them touches several packages and must be done in one PR. Interrupt
lines and the bus need small interfaces in `core` instead of direct references.
