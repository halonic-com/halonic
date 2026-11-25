# Decision: the fast-track signal rule names its third step, the queue-wait log

- Approval: HAL-18973, split from HAL-18320 (plan HAL-17450 rev 5, step 2, accepted by the board on 24 Nov); a security PR, so Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gABUuouMJsf4h1U1UkJo3/vzZiAmYm4IrKtQmBt/BUjtqQbipgsdeeuUXgdnAWZ6yJwz8aGdoyeqZC5cx1d0Cw==

## What changes

- `paperclip.signal-fast-track`: the requirement gains one sentence and one example for the third pure step, `signals/rules/fast-track-jumps.ts`. It keeps the queue-wait log of `fast-track/jumps.ts` and the daily totals line of `fast-track/pass.ts`, and must give the same log and line. The Source line names HAL-18973. Nothing is removed: the first two steps, the settings and the earlier examples read exactly as before.

## Why

HAL-18320 split the queue-wait log into its own pull request to stay near the 400-line guide; its note said the log follows as a third step. This adds that step and holds it to today's code with a parity test, so the plugin can later run the whole `fast-track` rule from the signal. No format change: `fast-track` is already in `SIGNAL_RULES`, and the step reads no setting.

## Tests

`signals/fast-track-jumps.test.ts` replays the jump inputs of `fast-track/pass.test.ts` (an entry first seen in the queue, the same pass again, its merge, the totals on the next UTC day), each from the state the one before kept, through `fastTrackPass` and the step, and compares the logs and totals lines; also an entry without the label, a repository the snapshot didn't read and a full log of 200. `signals/fast-track.test.ts` is unchanged apart from its header comment.

## Covers

- paperclip.signal-fast-track
