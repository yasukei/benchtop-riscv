# Conformance tests

These tests use the committed guest programs in `tests/fixtures/` in two ways:

- Execution tests run guest programs on a full machine and check the result.
  `riscv-tests.test.ts` discovers every `rv32ui-p-*` ELF fixture and runs it as a
  separate test on `createTestBoard`. Each must halt through HTIF with exit code 0
  within 1,000,000 instruction attempts (including traps, rather than `instret`).
  Failures report the guest test number, or the stop reason, PC and original ELF
  disassembly. Self-modifying code may differ from that original disassembly.
  An explicit test fails if no ELF fixtures are found.
- Fixture inspection tests do not execute guest code. `elf.test.ts` checks ELF
  loading metadata and symbols; `disassemble.test.ts` compares disassembly with
  the committed GNU objdump output.

Run both kinds with `pnpm test`; no guest toolchain or fixture rebuild is needed.
