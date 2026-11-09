# Architecture

benchtop-riscv is a browser-based RISC-V emulator. A user loads a guest program (an ELF
file, and later a firmware + kernel image), runs it, watches its console and inspects the
hart state, all inside the browser.

## Goals by milestone

| Milestone | Scope                                                                                          | Done when                                                          |
| --------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| M0        | Repository scaffold, ADRs, CI                                                                  | `typecheck`, `lint`, `test`, `build` and e2e pass                  |
| M1        | RV32I, minimal M-mode traps and CSRs, ELF loader, HTIF, test board, CLI runner, minimal web UI | all `rv32ui-p-*` riscv-tests pass                                  |
| M2        | M and A extensions, full Zicsr, M/S/U privilege modes, exceptions and interrupts, CLINT        | `rv32um-p-*`, `rv32ua-p-*`, `rv32mi-p-*`, `rv32si-p-*` pass        |
| M3        | Sv32 MMU, PLIC, UART, device tree, virt board, terminal UI                                     | `rv32ui-v-*` pass; OpenSBI + Linux boots to a shell in the browser |

Each milestone is tracked by a parent issue with sub-issues.

The `rv32ui-p` suite tests user-level instructions, but its start-up code (`env/p`) uses
`mhartid`, `mtvec`, `mepc`, `mstatus`, `ecall` and `mret`. M1 therefore includes the minimal
M-mode support needed to run it. A test passes when the guest writes `1` to the `tohost`
symbol; any other odd value `v` means test case `v >> 1` failed.

## Packages

| Package   | Responsibility                                                                  | May depend on                     |
| --------- | ------------------------------------------------------------------------------- | --------------------------------- |
| `core`    | Bus and device interfaces, stop reasons, UI⇔machine protocol                    | –                                 |
| `elf`     | ELF32 parsing: program headers, entry point, symbol table                       | `core`                            |
| `riscv`   | Hart state, decode and execute, CSRs, traps, privilege modes, MMU, disassembler | `core`                            |
| `devices` | RAM, HTIF, CLINT, PLIC, UART (ns16550a), later virtio                           | `core`                            |
| `machine` | Boards (memory map, device wiring, reset state), image loading, device tree     | `core`, `elf`, `riscv`, `devices` |
| `web`     | React UI; hosts a machine in a Web Worker                                       | all of the above                  |

Only `web` uses DOM APIs, so every other package runs in Node and in a Web Worker. The
direction is enforced by dependency-cruiser (`.dependency-cruiser.js`); see
[ADR 0001](adr/0001-monorepo-packages-and-dependency-direction.md).

## Data flow

```
 UI (main thread)                         machine Worker
 ┌──────────────┐  UiToMachineMessage   ┌───────────────────────────────┐
 │ React views  │ ────────────────────► │ worker host                   │
 │ MachineClient│ ◄──────────────────── │   machine.run(budget)         │
 └──────────────┘  MachineToUiMessage   │     hart ── Bus ── devices    │
                                        └───────────────────────────────┘
```

- The UI and the Worker exchange plain, structured-cloneable messages defined in
  `core/src/protocol.ts` ([ADR 0004](adr/0004-machine-in-a-web-worker.md)).
- The Worker runs the machine in slices: `run(budget)` executes up to `budget` instructions
  and returns a `StopReason`. Between slices the Worker handles messages (pause, step, UART
  input) and posts output and state.
- Emulated time is derived from the instruction count, never from the host clock
  ([ADR 0003](adr/0003-virtual-time.md)). The Worker decides how many slices to run per
  real-time interval.

## Hart and bus

- The hart is an interpreter written in TypeScript
  ([ADR 0002](adr/0002-typescript-interpreter.md)). Registers are an `Int32Array(32)`;
  writes to `x0` are discarded. The PC is a `number` holding a u32.
- The hart sees physical memory through the `Bus` interface in `core`. RAM gets a fast path
  (direct typed-array access) so that ordinary loads and stores do not go through dynamic
  dispatch; MMIO devices go through the bus.
- Traps are raised by throwing a trap object inside the hart and caught in the execution
  loop. Traps are rare compared to instructions, so this keeps the common path simple.
- Interrupt sources (CLINT, PLIC) drive the hart's pending bits through an interface defined
  in `core`, so `riscv` never imports `devices`.

## Boards

- **test board** (M1–M2): RAM at `0x8000_0000`, HTIF through the ELF's `tohost`/`fromhost`
  symbols. Used by riscv-tests and small bare-metal programs.
- **virt board** (M3): a memory map compatible with QEMU's `virt` machine (CLINT at
  `0x0200_0000`, PLIC at `0x0c00_0000`, UART at `0x1000_0000`, RAM at `0x8000_0000`), so that
  stock OpenSBI and Linux builds work with a generated device tree.

## Testing

- Unit tests sit next to the code (`packages/*/src/*.test.ts`).
- Conformance tests (`tests/conformance/`) run prebuilt guest binaries from
  `tests/fixtures/` ([ADR 0005](adr/0005-prebuilt-guest-binaries-as-fixtures.md)).
- Property tests use fast-check, e.g. encode/decode round trips and arithmetic against a
  BigInt reference.
- Playwright tests (`packages/web/e2e/`) cover the UI in Chromium.

## Releases and hosting

Versioning and the changelog follow [ADR 0006](adr/0006-versioning-changelog-and-releases.md).
The web app is deployed to GitHub Pages for each release
([ADR 0007](adr/0007-static-hosting-on-github-pages.md)).
