# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Until 1.0.0, any release may break compatibility.

## [Unreleased]

### Added

- Machine-mode CSRs, synchronous traps and M/U privilege switching with `mret`.
- HTIF polling of bare-metal program results in RAM.
- RV32I hart execution with bounded instruction slices and direct RAM access.
- RV32I, Zicsr and Zifencei instruction decoding and GNU objdump-style disassembly.
- ELF32 RISC-V executable parsing with loadable segments, entry point and symbol lookup.
- Physical address bus and little-endian RAM with a direct-access window for the hart.
- Web app shell that starts the machine Worker and shows its connection status.

[Unreleased]: https://github.com/yasukei/benchtop-riscv/commits/main
