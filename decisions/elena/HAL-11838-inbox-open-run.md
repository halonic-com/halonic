# Decision: the Inbox card gets Open run and Started by, and the row names its workflow

- Approval: Open run, "Started by" and the row's "Support reply · a person step" line are in the approved UX checklists 2.5 and 2.8 and flow-inbox 5.3; the words are the Runs list's own. Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gagrx7v+j+lF7kd6CINPj3SQ2+nBG8AtvGyR6Q3HCWzp1rRu8bpnC8jitx4SynpdgaMWIaweRKowIVToyi0uBg==
- Task: HAL-11838

## What changes

`inbox.wait-card`, `inbox.approval-card` and `inbox.page` now say what the code already had to do: the card header has "Started by" and **Open run**, and a row starts with its workflow. The Inbox reads the workflow, hub and starter of a run from the Runs list; before, nothing gave the cards an **Open run**, so it never showed in the app. Nothing was removed or weakened.

## Decided by the team

- A tool approval's row says only its workflow ("Support reply · Waiting 2 h"); "a person step" is for a wait step, the only wording the checklist gives. No new words.
- Without the Runs list, or while it doesn't hold the run yet, the card has no Open run and no Started by, and the row has no workflow, as before.

## Covers

- inbox.wait-card
- inbox.approval-card
- inbox.page
