# 0007. Static hosting on GitHub Pages

- Status: Accepted
- Date: 2026-11-09
- Extends: [0006](0006-versioning-changelog-and-releases.md)

## Context

The app runs entirely in the browser, including the machine in a Web Worker, so it needs
only static hosting. Deploying every push to `main` would expose unfinished milestone work.

## Decision

The web app is served from GitHub Pages under `/benchtop-riscv/`. The Pages workflow
deploys only when a GitHub Release is published, or manually for a given tag or commit. The
app must work under that sub-path; `pnpm test:e2e:pages` checks the Pages build. Nothing
may depend on custom response headers (see ADR 0004).

## Consequences

The public site always matches a release. Fixes reach users only with a release. Features
that need cross-origin isolation are unavailable unless a later ADR changes the hosting.
