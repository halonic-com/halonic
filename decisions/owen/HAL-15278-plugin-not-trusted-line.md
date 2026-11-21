# Decision: Studio's step panel names the plugin a connector didn't start for

- Approval: Liam approves this note in his review of this pull request on HAL-15278 (a team decision with no board card, HAL-2282 rule: it fills in a line of the run page's step panel the board already approved, from words check C557, row 48)
- Kind: user-visible
- Task: HAL-15278

## What changes

#4461 makes `halonic run` say "The plugin files isn't trusted yet." or "The plugin files changed
since you trusted it." when a plugin connector didn't start for its trust. For the same log,
Studio's step panel said only "✕ Didn't work: the connector *handbook* didn't start." for both.
It now says the reason, in the R11 form the panel already uses for a missing program or secret:

- `plugin-not-trusted`: "✕ Didn't work: the connector *handbook* didn't start: its plugin *files*
  isn't trusted yet."
- `plugin-changed`: "✕ Didn't work: the connector *handbook* didn't start: its plugin *files*
  changed since you trusted it."

The plugin's id is the cause's `name`, shown in italics as the connector is. A plugin cause
without a `name` keeps the plain "didn't start." line.

## Why

The same failure reads the same in Studio and the CLI (microcopy 1.6, E4). The line stays quiet,
with no button: R11 is a quiet line by design, and the plugin's own page has the trust step, so
naming the plugin is enough to find it. Sofia adds the two forms to R11 in the microcopy.

## Covers

- runs.run-view.step-failed-call
- packages/studio/features/runs/src/run-view/step-failed-call.test.tsx
