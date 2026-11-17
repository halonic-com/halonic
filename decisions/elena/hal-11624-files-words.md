# Decision: bring the Files words and flow in line with the approved frames

- Task: HAL-11624
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11613#document-ux-check (the UX check rows F1 to F6, F8 and F9 list the approved text for each change; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:h6H1cfZ1SesfEL0RTPlxSgfCbk6moE5GEK7wK6YZpO/57qerVNvqZu5JUCPGEIh0DIiWbip/n50iQhZlbRtzAw==

## What changes

Five Files requirements are edited so they say what the approved frames say:

- `files.ui.rename-file`: the name is checked as it is typed, a "Also updates *n* places" line sits under the field (not in the toast), the field is named "Rename *name*", and a refusal after the focus left the row shows a toast that stays, with **Try again**.
- `files.ui.new-file`: the failure Callout is last in the dialog body and **Try again** keeps focus on **Create**.
- `files.ui.tree-view`: the empty workspace has no **New file** button; the **+** button is the way in.
- `files.ui.outside-strip` and `files.ui.unreadable-strip`: one strip shows at a time (can't be read, in the trash, changed outside Halonic) and the unreadable strip has the warning look.

The tests that pinned the old words are updated. No test was weakened or skipped.

## Why

The merged Files pull requests differ from the approved words and frames in the UX check (HAL-11613).

## Covers

- files.ui.rename-file
- files.ui.new-file
- files.ui.tree-view
- files.ui.outside-strip
- files.ui.unreadable-strip
