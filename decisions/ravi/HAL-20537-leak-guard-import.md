# Decision: the leak guard may read the shared secret rules by path

- Approval: HAL-20537 (option (a) of the security review of halonic-com/halonic#6815)
- Kind: internal

The `layers` rule allows exactly one import to reach into another package by
path: from `tooling/check/src/leaks/` to `packages/core/std/src/secret-rules.ts`.
CI runs the leak guard on plain Node with nothing installed, so it can't import
`@halonicjs/std` by name. A pull request runs the base commit's copy of the
`layers` rule, so this exception has to be on `main` before #6815 moves the
rules there. A test pins that no other file or import gets through.

## Covers

- tooling/check/
