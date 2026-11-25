# Decision: the signal rules list gains fast-track

- Approval: the task HAL-18320 asks for the fast-track rules as a signal rule (plan HAL-17450 rev 5, step 2, accepted by the board on 24 Nov; split from HAL-18196); a security PR, so Liam signs this note in review
- Kind: user-visible

## What changes

- `format.signal-file`: a signal file may now pick `fast-track` as well, with four settings whose defaults keep today's behaviour (`reviewEscalateMinutes` 15, `enqueueAfterMinutes` 10, `queueSlowMinutes` 30, `jumpAhead` 8). The example that listed the rules names all four. Nothing is removed: the other three rules read exactly as before.
- `format.signal-refusals`: one more refusal (a `fast-track` setting out of range, `jumpAhead` below 8 above all) and its example. Every earlier refusal stays.
- `paperclip.signals`: the loader plans `fast-track` too, and an example says with which defaults. The fast-track rules keep running on their own code (`fast-track/`) until a later task switches the plugin to the rule.
- `cli.commands.validate.signal-refused`: gets examples for `fast-track`.
- The committed JSON Schemas of the signal file and of the workspace snapshot gain the `fast-track` choice.

## Why

HAL-18320, split from HAL-18196 to keep each PR reviewable. A signal file may change how long the rule waits, and may make a jump rarer, never more common: `jumpAhead` can't go below the board's 8 (HAL-15971 point 3). Who may add the label (the board's login), where a label added as `halonic-dev` counts, and which pull requests unblock everyone stay plugin settings the board keeps: a workspace file never sets them, and the board's login never goes into a public workspace.

## Tests

`signals/fast-track.test.ts` replays the inputs of `fast-track/rules.test.ts`, `pass.test.ts` and `scope.test.ts` through `fastTrackPass` and the rule's two steps, and compares their notices and remembered state. The queue-wait log (`fast-track/jumps.ts`) follows as a third step in its own pull request, to keep this one near the 400-line guide. `signal.test.ts`, `load.test.ts` and `signal-refused.test.ts` cover the settings, the defaults and `halonic validate`.

## Covers

- format.signal-file
- format.signal-refusals
- paperclip.signals
- cli.commands.validate.signal-refused
- packages/core/format/spec/signal.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
