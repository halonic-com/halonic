# Decision: `inbox.wait-context` no longer says the served Studio lacks the step's description

- Task: HAL-19450
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-19450 (Julian's review of #6460 asked for this wording)
- Kind: internal

## What changes

`inbox.wait-context` said the Studio shows a wait step's body as plain text "when the Studio
doesn't know the step's description, as the served Studio doesn't yet". The served Studio now
gets the description from `GET /api/waiting-runs` (`studio.served-wait-context`), so the example
now names a served Studio's host that says nothing about the run. The rule itself, and its tests,
are unchanged; only a test comment follows the new wording. No test was weakened or skipped.

## Why

The old example stopped being true with this pull request.

## Covers

- inbox.wait-context
