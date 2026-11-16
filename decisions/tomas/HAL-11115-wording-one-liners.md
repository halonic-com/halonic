# Decision: five wording fixes from the design check

- Task: HAL-11115
- Approval: HAL-11133 (Liam's review of PR 3187, team decision under the HAL-2282 rule for small wording on an approved screen)
- Kind: user-visible

## What changes

- The inbox toast names the workflow ("Support reply started"), not the start label.
- The Library empty view reads "No records match this view."
- Home Recent runs in a sample workspace says "No runs yet. Start one from the Inbox, and it shows up here." and drops the command-line note.
- A run that made no tool call has no "sent" part in its receipt or row; it never says "Sent".
- The two sandbox chips named in the design check use the `warning` tone.

No test was weakened or skipped.

## Why

The design check (HAL-11098) found each of these wordings differing from the approved spec.

## Covers

- inbox.request
- library.collection-grid
- runs.home
- runs.row-columns
- runs.row
- runs.run-view.receipt-summary
