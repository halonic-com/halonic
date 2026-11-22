# Decision: Studio's stopped-program line uses the CLI's words, and ends on a colon only before its line to run

- Approval: Tomas decides the words as the team on HAL-16099 (https://paperclip.halonic.com/HAL/issues/HAL-16099), from flow check C672 (#4) on HAL-16091 (HAL-2282 rule: a small wording on an approved screen, bringing it to words `halonic tools review` already says).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:CtOn6DDBWTdF3n6b6Ek/M8LaoLrjhq+mlPeydq5x4RR15jfk21u90LvYoghfDwjb4iE1gV7/THVFHlm8EvrFDA==

## What changes

When a connector's program stops right after it starts, Studio's connector page and
`halonic tools review` said it in two ways. Studio said "Couldn't list the tools: notes-mcp's
program `sh` stopped right after it started. To see why, run its command from `<file>` in a
terminal. …", the CLI "Couldn't list the tools from notes-mcp: its program sh stopped right after
it started." and "To see why, run the command and args from `<file>` yourself." "Its command"
reads as the program alone, and `npx` alone only prints its help (Sofia, HAL-13732).

- Studio now opens as the CLI does: "Couldn't list the tools from notes-mcp: its program `sh`
  stopped right after it started."
- It says "To see why, run the command and args from `<file>`" in every case, as the CLI does.
  With the line to run in a CommandBox under it, "yourself" stays microcopy 11.4's "in a
  terminal" (C650 row 6), and the line still goes on "The line below doesn't set its env or
  secrets, so set any it needs first:" before the box.
- A connector no file holds is "the notes-mcp connector file", as the CLI names it, in place of
  "its connector file".
- The line ends on a colon only when a CommandBox follows it. With no line to run (a Windows
  folder) it ends "yourself. Studio can't give you a line to copy for a Windows folder yet.", as
  before. A load-failure test now checks both endings.

## Tests

No test is removed or weakened. The load-failure and page tests check the new words in each case,
and one new load-failure test checks that the line ends on a colon with a line to run and on a
full stop without one.

## Covers

- library.listed-tools-waiting
