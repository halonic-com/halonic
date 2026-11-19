# Decision: Changes' headings sit at their level, and What's in it says what changed

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12618 (rows C3 and C4 of the keyboard and screen-reader check, HAL-12584; a team decision under HAL-2282, no new words)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0LiM2uTEgcx4za4+n5yebywwkoqsp+mmd7bCuB0clPpeOoKQhlWYsRzy+NkFqGGGzzhVjQIAhRf62om8ooqRDg==

Nothing on screen changes; what a screen reader hears does (WCAG 1.3.1).

- `source-control.change-list`: "Other files" is an `h3`, a group inside "Since your last version",
  not a second `h2` beside it.
- `source-control.create-version`: "What's in it" is an `h3` under the dialog's title and names its
  list. Each item's checkbox is described by what changed in it, "Deleted" or its list of changes,
  so it reads "refund-question.json, checkbox, checked, Deleted".
- `source-control.whats-changed-page`: with no path above them, the parts of Advanced, "Line 3",
  are `h2`s straight under the `h1`, as the groups already were.
- `kit.list-groups`: a group's heading may name its own level, for a group inside the one above it.
  The List's `groupHeadingLevel` stays the default.
- `kit.checkbox`: a `describedBy` prop points `aria-describedby` at visible text, before an
  unavailable reason or a Field's line.

No test was weakened: the one that read "Other files" among the `h2`s now finds it as the `h3`.

## Covers

- source-control.change-list
- source-control.create-version
- source-control.whats-changed-page
- kit.list-groups
- kit.checkbox
