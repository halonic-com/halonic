# Decision: accept names the reject command for a changed file, and gone texts say "Remove them from the list"

- Task: HAL-16162
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16162 (a team decision with no board card, HAL-2282 rule: wording of approved CLI output; rows 37 and 38 of words check C681 on HAL-16153)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:Zi0xvDk2BQsZXCgNs4ZBcf/hBtLLubucY6ta1THssXrW8rTnzrdEJJfoP1hHhs6UihNvSS/8NdrwTVLRhjsGDg==

## What changes

- **A file changed since the run (C681 37).** `halonic proposals accept` says what Studio says for
  the same file (C682 2, HAL-16157) and names the command, as the CLI's other fixes do: "notes/a.md
  changed since the run, so it wasn't written. To keep it as it is now, reject it with halonic
  proposals reject 01jd8q notes/a.md." With several files: "notes/a.md and notes/b.md changed since
  the run, so they weren't written. To keep them as they are now, reject each with halonic
  proposals reject 01jd8q <file>." A file edited by hand stays undecided, so reject is the one way
  out; "Edit by hand, or reject" read as two. The command keeps the user's `--dir`, and a path with
  a space is quoted so the command can be copied as it is.
- **Changes deleted outside Halonic (C681 38).** The fix under "Run 01jd8q's changes were deleted
  outside Halonic, so they can't be shown or accepted." said "Reject it with halonic proposals
  reject 01jd8q to remove it."; "it" had nothing to point back to after "changes … they". It now
  says "Remove them from the list with halonic proposals reject 01jd8q.", and reject then prints
  "Removed run 01jd8q's proposal: …", so the two lines share the verb.

Nothing is removed or weakened: every test still runs, and each line gets a test (the several-files
line with `--dir`, and `show` of a proposal whose texts are gone).

## Covers

- cli.commands.proposals.decide
- cli.commands.proposals.show
