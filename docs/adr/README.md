# Architecture Decision Records

An ADR records one design decision: its context, the decision, and its consequences.

- One decision per file, numbered: `NNNN-short-title.md`. Copy `template.md`.
- ADRs are not edited after they are accepted. To change a decision, add a new ADR and
  mark the old one `Superseded by NNNN`.
- Implementation follows accepted ADRs. If an issue conflicts with an ADR, raise it in the
  PR instead of silently diverging.

## Index

- [0001. Monorepo packages and dependency direction](0001-monorepo-packages-and-dependency-direction.md)
- [0002. A TypeScript interpreter](0002-typescript-interpreter.md)
- [0003. Virtual time](0003-virtual-time.md)
- [0004. Machine in a Web Worker](0004-machine-in-a-web-worker.md)
- [0005. Prebuilt guest binaries as test fixtures](0005-prebuilt-guest-binaries-as-fixtures.md)
- [0006. Versioning, changelog and releases](0006-versioning-changelog-and-releases.md)
- [0007. Static hosting on GitHub Pages](0007-static-hosting-on-github-pages.md)
