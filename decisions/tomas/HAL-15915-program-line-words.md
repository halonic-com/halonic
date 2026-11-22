# Decision: the stopped program's line points to its line, says what it leaves out, and a Windows folder says it gets none

- Approval: Tomas decides the words as the team on HAL-15915 (https://paperclip.halonic.com/HAL/issues/HAL-15915), from flow check C651 (#4) on HAL-15910, and Sofia's words check C650 (row 6) on HAL-15922 (https://paperclip.halonic.com/HAL/issues/HAL-15922) (HAL-2282 rule: a small wording on an approved screen, adding to the words HAL-15809 approved).
- Kind: user-visible

## What changes

Since HAL-15809, a connector whose program stops right after it starts makes the connector page
say "… To see why, run the command and args from `<file>` yourself:" with the line to run in a
CommandBox. That line leaves out the connector's `env` and secrets, so a program that stops only
because a secret is missing runs differently by hand, and the person can't tell why. A Windows
folder gets no line, and the page said nothing in its place.

- With a line, the sentence now points to it, in microcopy 11.4's "in a terminal" (C650 row 6):
  "… To see why, run its command from `<file>` in a terminal." "run the command and args from
  `<file>` yourself" is the CLI's sentence for a terminal that shows no line, so it sent the
  person to the file. The words then go on: "The line below doesn't set its env or secrets, so set
  any it needs first:" before the CommandBox.
- With no line (a Windows folder, the only case the host gives none), the CLI's sentence stays and
  the words end: "Studio can't give you a line to copy for a Windows folder yet."
- The line itself, **Try again** and the file's name don't change.

## Tests

No test is removed or weakened. The load-failure and page tests now check the new sentence in
each case.

## Covers

- library.listed-tools-waiting
