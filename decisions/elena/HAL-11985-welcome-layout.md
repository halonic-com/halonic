# Decision: Welcome keeps its place when Recent or an error appears, and long Recent folders keep their end

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11985 (Sofia's UX check, HAL-11973; Liam approves and signs this note in review)
- Kind: user-visible

Three rules are added to `shell.welcome-recent`:

- The Welcome column hangs 18% of the window height from the top instead of being centred, so Recent rows or an error line appearing moves nothing above them.
- A Recent row that is too long is cut in the middle and always shows the last 24 characters of the folder. The row's accessible name is still the full name and folder.
- The Recent row that failed to open gets the danger outline and `aria-describedby` pointing at the alert line.

No wording changes and no existing rule is weakened. Tests cover the failed-row marking and the middle cut.

## Covers

- shell.welcome-recent
