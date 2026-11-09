# Decision: a `sandbox.opened` run log event and its display copy of the profile

- Approval: the board approved proposal 1 ("What this run can do") for v0.1 in the `proposals` document on [HAL-1601](/HAL/issues/HAL-1601), with Julian's conditions from [HAL-1673](/HAL/issues/HAL-1673); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1707

## What changes

The run log gains one event, `sandbox.opened`, with `state`, `agent` and `sandbox`, a display
copy of the step's sandbox profile. `sandboxOpenedView(profile, options)` makes that copy. Nothing
is renamed or removed. The `events.run-log-contract` example that lists the event types now says
"the 23 reference names plus the events added since, each with its own requirement", and the type
test that pins the list gains `sandbox.opened`.

## Why

Studio's run view and step details show what a sandboxed step could do, also for finished runs,
so it has to be in the log. Julian's conditions are built in and tested:

- The view reads a fixed list of fields by name and never spreads the profile, so `env` and any
  field added to the profile later can't reach the log. A test passes a profile with `env` and
  unknown fields and checks that neither they nor their values appear.
- Denied paths are logged as group codes when all of a group's paths are denied, plus the other
  paths one by one (the person's own). A group with no paths is never named, so the screen can't
  claim something was blocked when nothing was (Liam's review). Home paths start with `~`. All
  are tested.

The package keeps no dependency on `@halonicjs/ports`: the view takes the parts of a profile it
reads (`ShownSandboxProfile`), which the port's `SandboxProfile` fits, and repeats the three
strength values. The event holds codes and paths, never sentences, so wording stays in the
message catalogue. Older logs have no such event and read as before.

No test was weakened or removed.

## Covers

- events.run-log-contract
- events.sandbox-opened
- packages/core/events/src/run-event.test.ts
