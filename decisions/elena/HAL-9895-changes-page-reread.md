# Decision: keep the Changes page on a failed re-read and say what Check again found

- Task: HAL-9895
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-9895 (Sofia's design check on HAL-9890 and checklist A.2 on HAL-9765; a team decision with no board card, HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JubDgNPxQ+Rzf229In3wVIiwVyqTkz3dQlTUSCuBPPuK28RhHLZm8hEDlLHkefa/74tlSGTKZM9rlz9lnwhkBg==

## What changes

A failed re-read keeps the last list and shows "Couldn't load changes", the reason and Try again
above it. Check again shows "Checking…" and then "Still can't find git." when git is still missing.
Turn on history shows "Turning on history…" and moves focus to the heading afterwards. The
`h1` can take focus. Git's "fatal:" or "error:" label is dropped from the reason. A nested git
folder has its own wording, "This folder is part of a larger git repository.", with no Try again.

The requirement `source-control.changes-page` gains these cases. No test was weakened or skipped.

## Why

A later failed read was silent, so the page looked fine while showing stale changes, and Check
again gave no sign it had run (HAL-9890).

## Covers

- source-control.changes-page
