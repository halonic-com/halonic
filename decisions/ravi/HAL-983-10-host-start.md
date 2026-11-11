# Decision: the launcher starts programs without a fence through the `Sandbox` port

- Approval: an entry in `tooling/check/process-starters.json` and a port change need Liam's review (docs/guides/checks.md, process-starts; ADR 2026-11-11-sandbox-without-fence); Liam approves this note in review of the launcher start PR on [HAL-983](/HAL/issues/HAL-983)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:x+wOTTZmDj29rxL3pXcceNxlmV6KeGes9zv8O486M5IrQ5ig5vUcg0tGNKzrGlO2j0eMx7jAtKZ158KqfjwrBg==
- Task: HAL-983

## What changes

- `tooling/check/process-starters.json` gains one entry:
  `packages/adapters/sandbox-host/src/host-process.ts`, with
  `packages/adapters/sandbox-host/src/host-sandbox.starts.test.ts` as its scripts test.
- The requirement `ports.sandbox-fence-proof` gains the fence proof `off`, for the launcher
  that has no fence by design (strength `none`). `start` still throws while the proof is
  `not-fenced`.

## Why

The design starts local integrations through `sandbox-host` on the path the user confirmed
without the fence (HAL-958 design 4.3), so `sandbox-host` and `sandbox-srt` stay the only
adapters that start programs, and every start goes through the `Sandbox` port, where a fake
can count them (HAL-3386 test plan, seam 3). The port had no way to say "no fence" honestly:
`fenced` would lie to the trust check, and `not-fenced` refuses to start. The ADR has the
details and the version bump to 5.

The new starter starts only an absolute path that `findProgram` resolved from the profile's
`PATH`, never the working folder, with no shell and only the profile's variables. It refuses
a program, argument or folder under a skill's `scripts/` folder before anything starts, both
in the session and in the starter itself. The scripts test checks both, with a fake
`child_process` so nothing runs.

## Covers

- tooling/check/
- ports.sandbox-fence-proof
