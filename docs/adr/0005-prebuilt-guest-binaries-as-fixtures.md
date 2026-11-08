# 0005. Prebuilt guest binaries as test fixtures

- Status: Accepted
- Date: 2026-11-09

## Context

Conformance tests such as riscv-tests need RISC-V binaries. Building them requires a RISC-V
cross toolchain, which is large and slow to install in CI and on contributors' machines.

## Decision

Commit prebuilt guest binaries under `tests/fixtures/<suite>/`. Each suite directory
contains a README naming the upstream repository and revision, the upstream license, the
build configuration, and a script under `scripts/` that regenerates the binaries
reproducibly in a container. CI only runs the binaries; it never builds them. Large
artifacts that do not fit in git (for example a Linux image) are decided by a later ADR.

## Consequences

CI and local test runs need no cross toolchain. Updating a suite is an explicit PR that
reruns the script and records the new revision. Reviewers cannot read binary diffs, so the
README and script are what make a fixture trustworthy.
