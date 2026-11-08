# 0002. A TypeScript interpreter

- Status: Accepted
- Date: 2026-11-09

## Context

The emulator runs in the browser. Options are an interpreter in TypeScript, an emulator
written in another language and compiled to WebAssembly, or a JIT that emits JavaScript or
WebAssembly at run time. Booting Linux needs tens to hundreds of millions of instructions,
but the project's first goal is a correct and readable implementation that agents can
change safely.

## Decision

Implement the hart as a plain TypeScript interpreter that decodes and executes one
instruction at a time. Write the hot path for speed without changing that structure:
registers in an `Int32Array`, no allocation per instruction, a direct typed-array path for
RAM, and `switch`-based dispatch. Decoded-instruction caches, JIT compilation or a
WebAssembly core are out of scope until a later ADR adopts one, backed by a benchmark.

## Consequences

One language and one toolchain across the repository; the hart is debuggable with ordinary
tools and unit-testable in Node. Execution speed is limited, so Linux boot (M3) will be slow
and may need a later performance ADR.
