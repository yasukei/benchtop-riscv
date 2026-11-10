# benchtop-riscv

A browser-based RISC-V emulator. It grows from RV32I user code to RV32IMA with privilege
modes, and finally to booting Linux in the browser. See [the architecture](docs/architecture.md)
for the milestones and the package layout, and [the ADRs](docs/adr/README.md) for design
decisions.

## Development

Requirements: Node.js 26 or later (the CI major is pinned in `.node-version`) and pnpm (the
version is pinned in `package.json`).

```sh
pnpm install
pnpm typecheck   # TypeScript, strict mode
pnpm lint        # ESLint, dependency direction (dependency-cruiser), Prettier check
pnpm test        # unit and conformance tests (Vitest)
```

Other scripts:

- `pnpm dev` – start the web app
- `pnpm build` – build every package; run before submitting a PR
- `pnpm format` – format all files with Prettier
- `pnpm test:coverage` – unit and conformance tests with V8 coverage; open
  `coverage/index.html` for the HTML report
- `pnpm test:e2e` – end-to-end tests (Playwright); run for UI changes
- `pnpm test:e2e:pages` – smoke tests against the GitHub Pages build under `/benchtop-riscv/`

Before the first e2e run, install the browser matching the locked Playwright version:

```sh
pnpm exec playwright install chromium   # add --with-deps on Linux if libraries are missing
```

GitHub Actions workflows are checked by zizmor in CI; run `uvx zizmor==1.31.1 .github/` locally.

## Run a guest from the terminal

```sh
pnpm run:elf path/to/program.elf --max-instructions 1000000
```

This builds the machine and its dependencies, then runs the ELF on the test board
(RAM at `0x80000000`, 16 MiB). Node runs the TypeScript CLI directly; no loader is needed.
Relative ELF paths are resolved from the directory where you invoke the command.
The default limit is 100,000,000 instruction attempts, including traps that do not retire
an instruction. The report shows the stop reason, retired instruction count (`instret`),
and final PC with disassembly from current RAM (`<unreadable>` outside aligned RAM words).

Bare-metal programs stop through the ELF's `tohost` symbol. The process returns the HTIF
exit code (0 means pass); codes above 255 are printed in full and return status 1. Reaching
the instruction limit, failing to read or load the ELF, or an emulator fatal error also
returns status 1 with a diagnostic on stderr. Guest console output is not supported.

## License

[MIT](LICENSE)
