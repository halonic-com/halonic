# Decision: a kept answer field may name a value inside objects

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-17522 (Liam's plan approval, 27 Nov 01:03 UTC, point 2: dotted `keep` paths, object keys only, at most 3 segments, plain values only, a missing path left out, the same name grammar checked in TypeScript)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Gwwb34cDS/hyG4K51AZ8Iwm4+uDi/izPcFGIfBRXHLGz7MH3Rqa8YSlwy4MNwc9v+3mcu0A1RIvCTrvvB9PmBw==

## What changes

`events.action-events` said kept answer fields sit under plain field names.
A kept field's name may now also be up to 3 plain names joined by `.`, such
as `triggering_actor.login`. A name still can't reach into a list (a segment
can't start with a digit), and the value must still be plain. Request
parameters and expected state keep plain names only. One example is added; no
example or test is removed or weakened, and `x-header` is still refused.

The shell's record check (`record_check.rs`) takes the same grammar, so its
shared golden `record-events.json` changes too. The dotted case it held as
refused until this change ("taken once #6725 lands") moves to taken, with 2
and 3 segments. Three refused cases take its place: 4 segments, a segment
that reaches into a list, and an empty segment. No taken case is removed.

## Why

`github.approve-deployment@1` (HAL-17522) must show who started the run,
`triggering_actor.login`, and `github.configure-environment@1` needs values
inside the environment answer. The shell's `action-send` now keeps such
values under the dotted name. Without this change the step's
`action.step.succeeded` event would fail its check after the step had run.

## Covers

- events.action-events
- packages/adapters/action-send-tauri/src/golden/record-events.json
