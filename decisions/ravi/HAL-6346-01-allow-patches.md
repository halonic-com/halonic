# Decision: the dependency check allows a listed patch, pinned by its file's hash

- Approval: HAL-6346. Liam approves this note in review of this PR.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:9HrsmlL13NjAscABAUGMaVFgGCVYNZ3XJaDJdh+KB5nUzVCOijIqb+AbtyJLmZqJtW5GKW9l3aVr7Cxv81feCQ==
- Task: HAL-6346

## What changes

- `patchedDependencies:` in `pnpm-workspace.yaml` no longer always fails. It passes for a patch
  listed in the new `tooling/check/patches-allowed.json`, the way `overrides:` passes through
  `overrides-allowed.json`. Each entry names the package at an exact version, the patch file
  directly in `patches/`, the file's SHA-256 (line ends as `\n`), a reason and a `remove-when`.
- The check fails a patch that isn't listed, one for another version than the catalog's,
  another file than the listed one, a missing file, and a file whose hash differs.
- An entry with no matching patch is a warning, not an error, as an unused entry in
  `dependencies.json` is. CI reads the lists from the base commit, so the entry has to merge
  before the patch, and on its own it is unused.
- `patches-allowed.json` is a list file: `--lists-from` reads it from the base commit.
- The list holds one entry: the sandbox-runtime patch that adds `network.denyMachLookup`.

## Why

A36 showed that a program in srt's macOS fence gets a Keychain item back through securityd,
because srt always allows those Mach services and has no setting to take one away. The design
(HAL-958, section 6) says `sandbox-srt` must deny them before I5 ships. A small patch of srt is
the narrowest fix that keeps the srt command line as it is; the alternatives were rewriting the
command srt builds (fragile string surgery on a shell-quoted profile) or waiting on upstream.
The hash keeps a patch as reviewable as an override: any change to it needs a changed list.

## Covers

- tooling/check/
