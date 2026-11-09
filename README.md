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

## License

[MIT](LICENSE)
