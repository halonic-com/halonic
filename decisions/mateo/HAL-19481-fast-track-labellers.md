# Decision: only the board's queue login fast-tracks, never the account every agent posts as

- Task: HAL-19481
- Approval: the board's go on phase 2 of the plan on HAL-19228 (26 Nov), item 2.3 with Liam's change 7 from HAL-19325; Liam reviews and signs this note
- Kind: internal

## What changes

- `defaultSettings.fastTrackLabellers` is empty: `halonic-dev`, the account every agent posts as, no longer counts as a `fast-track` labeller (`src/merge-control/state.ts`).
- `rulesOf` adds the board's queue login from config (`mergeControl.mergerLogin`) to the labellers, as it already does to the auto-label authors (`src/plugin/merge-control-job.ts`). Without it, no label counts.
- Requirement `paperclip.merge-control-fast-track` now says the board's queue login only, never `halonic-dev`.
- Tests: `fill.test.ts` now expects a `halonic-dev` label to be logged as unverified and queued normally, instead of going first. The recorded facts fixture labels as the queue login. The simulation's rule sets get a stand-in board login, because its day replays the board's labels. A new test covers `rulesOf`.

## Why

2.3 of the plan on HAL-19228: any agent can add a label as `halonic-dev`, so a `fast-track` from that account could be any agent's. Since 0.4, only the board and the queue session add it.

Not in this change:
- `product-owner` is checked only in the Merger's own rules, which belong to the server session.
- The fast-track monitor's `halonic-dev` scope list (`fast-track/scope.ts`, a board setting) only logs, and is left as it is.

## Tests

No test was skipped. The changed expectations above follow the new rule; each still checks the same behaviour for a verified and an unverified labeller.

## Covers

- tooling/paperclip/
- paperclip.merge-control-fast-track
