# Decision: sandbox-srt is ready on Linux only once srt's smallest sandbox runs

- Task: HAL-6518
- Approval: decided on [HAL-6513](/HAL/issues/HAL-6513); Liam approves this note in review on [HAL-6518](/HAL/issues/HAL-6518)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QS4XSbbHYF2qraUR8GO4/BTw//wvifnJ8IkxYxCmzK9qqxcKfkln5/a7wSvmmhfbOoTUWMYN5gpZng/aomjjCg==

## What changes

The active requirement `sandbox-srt.check` gets one more rule for Linux: the adapter says it can start only once srt has started its smallest real sandbox and run `true` in it. That sandbox goes through the same settings, launcher and runner as a session, with a bridge, so srt also sets up its network namespace and `socat` bridge. It has 10 seconds, and the answer is kept for the rest of the process. If it fails, the reason is `other`, with srt's own line as the sentence.

The requirement gets one new example (bubblewrap starts but srt can't set up its network bridge: `other` with srt's line, not "ready"). No example was removed or weakened.

## Why

Before this, "ready · bubblewrap" only proved that bubblewrap could create a user namespace. A machine could pass that and still fail when a session opened, for example when srt couldn't set up the network namespace or the `socat` bridge. `doctor` then showed a false green.

## Cost

The bubblewrap fence job in CI measured the check at 320 ms (run 43117844427). It runs once per process, so `doctor` gets about a third of a second slower on Linux and later checks in the same process are free.

## Tests

No test was skipped or weakened. `ready-check.test.ts` covers success, srt's own failure line, the time limit and clean-up of the temporary folders. `srt-sandbox.test.ts` checks that the ready check runs only after the other reasons pass, once per process, and turns a failure into `other`. The bubblewrap fence job starts the real sandbox and prints how long it took.

## Covers

- sandbox-srt.check
