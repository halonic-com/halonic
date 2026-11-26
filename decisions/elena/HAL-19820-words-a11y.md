# Decision: screen readers hear a Recent row's step and each row action's chat

- Task: HAL-19820
- Approval: team-decided wording from Sofia's words and a11y check on HAL-19815 (HAL-2282); the reviewer approves this note in review
- Kind: user-visible

## What changes

`shell.welcome-recent`: while a Recent row opens, the polite status says the same step the row
shows, "Starting the engine…" and then "Reading the workspace…", instead of only "Opening…".
"Opening…" stays only for the moment before a step is known. One example was added, and the two tests
that checked the status said "Opening…" (`welcome-recent.test.tsx`, `welcome.test.tsx`) now check
that it says the step (WCAG 4.1.3).

`kit.plain-list`: a row's action may carry a spoken label, which names its button; it starts with
the words the button shows (WCAG 2.5.3). One example was added.

`messenger.read-marks`: each row's "Mark as read" and "Mark as unread" is named for a screen
reader with the chat's name after the words, such as "Mark as read: Chief", so a list of rows no
longer holds many buttons with the same name. One example was added.

No example was removed or weakened, and no test was removed.

## Why

Sofia's check of the merges of 26 Nov 11:15–14:15 UTC (HAL-19815) found that a sighted person saw
the opening step while a screen reader heard only "Opening…", and that every row's action had the
same name, so a screen reader's button list or a voice user met 20 identical buttons.

## Covers

- shell.welcome-recent
- kit.plain-list
- messenger.read-marks
