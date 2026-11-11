# Decision: the fence CI jobs also run the integration runner's fence tests

- Approval: a change under `.github/` and a new skip need Liam's review (docs/guides/checks.md, requirement guard); Liam approves this note in review of the fenced attack PR on [HAL-983](/HAL/issues/HAL-983)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hvBH/En3iWg3FFFzGAmRSIa3C4AhPLcrk+156F3owLMV1mFO7ikEqqonF/AgFkGEy5nDII5XKJkCXeZy4YDTDw==
- Task: HAL-983

## What changes

- `.github/workflows/ci.yml`: the `sandbox-fence` area also covers
  `packages/adapters/integration-runner/`, and the two fence jobs (bubblewrap and Seatbelt)
  run that package's `pnpm test:fence` after `sandbox-srt`'s. Nothing else in the workflow
  changes.
- `packages/adapters/integration-runner/fence/runner-attacks.test.ts` skips one block,
  attack case A36, everywhere but macOS (`describe.skipIf(!isMac)`).

## Why

The I5 design (HAL-958, section 6) asks for the attack cases to run against the real fence on
Linux and macOS, with Node's layer on and off. Only the fence jobs can start srt, so the
runner's fence tests run there, next to `sandbox-srt`'s own, and not in `pnpm test`.

A36 asks securityd for a keychain item through the system's `security` tool. Keychains and
securityd exist only on macOS. On Linux the same attack goes to the Secret Service over a
D-Bus socket in a socket folder, which A35 (sockets on disk) and A17 (no bus address in the
environment) already cover in the same file, so the skip leaves no platform untested.

## Covers

- .github/
- packages/adapters/integration-runner/fence/runner-attacks.test.ts
