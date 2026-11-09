# @halonicjs/profile

Owner: priya · Layer: core · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Where Halonic keeps a person's files: the profile folder, the same for the CLI and the Studio, and inside it each workspace's folders for runs and blobs.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                           | What it does                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm verify`                                     | checks every package your change affects, including the ones that depend on this one |
| `pnpm turbo run test --filter=@halonicjs/profile` | runs only this package's tests (and the codegen they need)                           |

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
