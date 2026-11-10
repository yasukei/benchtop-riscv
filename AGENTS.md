# AGENTS.md

## Overview

benchtop-riscv is a browser-based RISC-V emulator. It grows from RV32I user code to
RV32IMA with privilege modes, and finally to booting Linux in the browser.
Requirements and specifications live in GitHub issues; the issue is the source of truth.

Monorepo (pnpm workspaces, TypeScript):

- `packages/core` – shared contracts: bus and device interfaces, stop reasons, UI⇔machine protocol
- `packages/elf` – ELF32 parser: segments, entry point, symbols (no DOM)
- `packages/riscv` – the hart: decoder, executor, CSRs, traps, privilege modes, MMU, disassembler (no DOM)
- `packages/devices` – memory-mapped devices: RAM, HTIF, CLINT, PLIC, UART (no DOM)
- `packages/machine` – boards that wire a hart, devices and loaders together (no DOM)
- `packages/web` – React UI; the machine runs in a Web Worker

Dependency direction: `web → machine → riscv | devices | elf → core`. Never import upward;
`riscv`, `devices` and `elf` do not import each other.

Design decisions are recorded in `docs/adr/` (overview: `docs/architecture.md`). Follow them; to change one, add a new ADR that supersedes it.

## Commands

- `pnpm install` – install workspace dependencies; use `--frozen-lockfile` to match CI
- `pnpm dev` – start the web app
- `pnpm build` – build every package
- `pnpm run:elf <file> [--max-instructions <n>]` – build machine dependencies and run an ELF
  in Node; the default budget is 100,000,000 instruction attempts
- `pnpm --filter @benchtop-riscv/web build:pages` – build the web app for GitHub Pages
- `pnpm typecheck` – check TypeScript in strict mode
- `pnpm lint` – ESLint, dependency direction (dependency-cruiser), Prettier check
- `pnpm test` – unit and conformance tests (Vitest)
- `pnpm test:coverage` – unit and conformance tests with V8 coverage
- `pnpm test:e2e` – end-to-end tests (Playwright, Chromium)
- `pnpm test:e2e:pages` – smoke tests against the GitHub Pages build under `/benchtop-riscv/`

## Conventions

- English only: code, comments, commit messages, PR descriptions, docs, and the UI.
- TypeScript strict mode. No `any` without a comment explaining why.
- Keep logic out of React components; put it in plain TS modules with unit tests.
- Emulator packages never read the host clock or use host timers; emulated time comes
  from executed instructions (ADR 0003). Only `web` decides how fast to run.
- Hot paths (instruction execution, memory access) avoid per-instruction allocation.
  Registers are typed arrays; values are normalized with `| 0` (signed) or `>>> 0` (unsigned).
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`).
- One issue per PR. Reference it with `Closes #N`.
- Changes users can notice (the web app, supported ISA features, user docs) add an entry
  under `[Unreleased]` in `CHANGELOG.md` in the same PR (ADR 0006).

## Verification

Before finishing, `pnpm typecheck && pnpm lint && pnpm test` must pass.

- Run `pnpm build` before submitting a PR to check every package's production build, as CI does.
- UI changes: run `pnpm test:e2e`.
- Build or base-path changes: run `pnpm test:e2e:pages`.
- Workflow changes: run `uvx zizmor==1.31.1 .github/`, matching CI's workflow check.

CI runs typecheck, lint, unit/conformance tests with coverage, build and both Playwright suites
on every PR. Run that full set locally to reproduce CI.

On a fresh clone, install the browser matching the locked Playwright version first:
`pnpm exec playwright install chromium` (on Linux, add `--with-deps` if system libraries are
missing). To use an existing Chromium instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to
its absolute executable path.

### Test coverage

- New behavior needs a test in the same PR.
- Instruction semantics: unit tests next to the implementation in `packages/riscv/src/`.
- Hart/device integration: tests under `tests/integration/` use real devices.
- Whole-program behavior: a case under `tests/conformance/` (e.g. riscv-tests suites).
- Guest binaries live in `tests/fixtures/` with their source, revision, license and the
  script that regenerates them (ADR 0005). Never commit a binary without that record.
- UI behavior: add or update a Playwright test in `packages/web/e2e/`.

## Don'ts

- Don't add a dependency without stating why in the PR description.
- Don't change types in `packages/core` without updating every consumer in the same PR.
- Don't weaken, skip, or delete tests to make them pass.
- Don't go beyond the issue's scope; note follow-ups in the PR instead.
