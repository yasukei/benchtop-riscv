# 0006. Versioning, changelog and releases

- Status: Accepted
- Date: 2026-11-09

## Context

The workspace packages are private and are not published to npm; the only thing users run
is the web app. This is a personal project, and the maintainer wants to keep changing the
internal contracts and the UI–machine protocol without promising backward compatibility yet.

## Decision

- The repository has one version. The root `package.json` and every package's
  `package.json` always carry the same version; a tooling test checks this.
- Versions follow Semantic Versioning 2.0.0. While the major version is 0, any release may
  break compatibility.
- Each completed milestone is a minor release (M1 is 0.1.0, M2 is 0.2.0). A release that
  contains only fixes is a patch release.
- `CHANGELOG.md` follows Keep a Changelog 1.1.0. A pull request that changes something users
  can notice (the web app, supported ISA features and devices, user-facing docs) adds an
  entry under `[Unreleased]` in the same pull request. Changes to tests, refactoring and CI
  need no entry.
- A release is made by a pull request that moves the `[Unreleased]` entries into a new
  version section with the release date, updates the comparison links and sets every
  `package.json` version. After it is merged, the maintainer creates an annotated tag
  `vX.Y.Z` on the merge commit and a GitHub Release whose notes are that version's section.

## Consequences

Users can see what changed in each release without reading the commit history. Every
user-visible pull request has one more file to update. Releases stay manual; automate them
if they become a chore.
