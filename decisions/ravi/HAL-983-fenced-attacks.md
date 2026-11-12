# Decision: the fence CI jobs also run the integration runner's fence tests

- Approval: a change under `.github/` and a new skip need Liam's review (docs/guides/checks.md, requirement guard); Liam approves this note in review of the fenced attack PR on HAL-983
- Kind: internal
- Task: HAL-983

## What changes

- `.github/workflows/ci.yml`: the `sandbox-fence` area also covers
  `packages/adapters/integration-runner/`, and the two fence jobs (bubblewrap and Seatbelt)
  run that package's `pnpm test:fence` after `sandbox-srt`'s. Nothing else in the workflow
  changes.
- `packages/adapters/integration-runner/fence/runner-attacks.test.ts` skips one block,
  attack case A36, everywhere but macOS (`describe.skipIf(!isMac)`).
- `packages/adapters/integration-runner` gets `@halonicjs/adapter-sandbox-srt` as a
  devDependency, so its fence tests can open real srt sessions. It is our own package; nothing
  from outside comes in with it.

## Why

The I5 design (HAL-958, section 6) asks for the attack cases to run against the real fence on
Linux and macOS, with Node's layer on and off. Only the fence jobs can start srt, so the
runner's fence tests run there, next to `sandbox-srt`'s own, and not in `pnpm test`.

A36 asks securityd for a keychain item through the system's `security` tool. Keychains and
securityd exist only on macOS. On Linux the same attack goes to the Secret Service over a
D-Bus socket in a socket folder, which A35 (sockets on disk) and A17 (no bus address in the
environment) cover in the same file.

## Known gaps

Corrected in HAL-6301. This note first said the A36 skip "leaves no
platform untested". That was wrong: the first A36 named the keychain by its path in the hidden
home folder, so the file fence refused it and securityd was never asked, and any error counted
as a refusal. The cases below pass because they expect what happens today, so a fix in either
direction fails them and the gap stays written down.

- **A36, macOS, Node's layer off (closed):** asked by name, without a path, securityd handed
  the keychain item out inside the fence, because srt 0.0.81 always allows
  `com.apple.SecurityServer` and `com.apple.securityd.xpc`. `sandbox-srt` now denies those
  services to a profile that denies the key store, as the runner's does
  (HAL-6346), so the case expects `refused`.
- **A12, Node's layer off:** srt leaves reads open apart from the hidden folders, so a file
  outside the home and socket folders is readable, although the design says it must be refused.
  The case expects `allowed` with the layer off.
- **Only Node's layer stops these:** with the layer off, A14 starts a process, and A15 starts a
  worker and creates a WASI instance, and its add-on attempt reaches the loader. The fence still
  holds what they run (A4, A12, A13), but nothing below Node refuses the start itself.

## Covers

- .github/
- packages/adapters/integration-runner/fence/runner-attacks.test.ts
