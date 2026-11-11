# Decision: the CLI words `not-supported` as WSL 1, and `doctor` shows what failed for `other`

- Task: HAL-6532 (part 3 of HAL-6518)
- Approval: the words are the team's call on an approved screen (board, HAL-2282), decided by Sofia on [HAL-6526](/HAL/issues/HAL-6526); Liam approves this note in review
- Kind: internal

## What changes

- `not-supported` gets WSL 1's words in `apps/cli/src/messages/sandbox.ts`. The CLI's sandbox
  (srt on Linux) gives that code only on WSL 1 (HAL-6518), where "update the operating system"
  isn't the fix: switching the distro to WSL 2 is. The fix names the distro from
  `WSL_DISTRO_NAME`: as it is when it has only letters, digits, `.`, `-` and `_`, in double
  quotes otherwise, and `<distro>` when it is unset, empty, or has a character PowerShell's double
  quotes don't keep as it is (`"`, `$`, a backtick) or a control or bidi character.
- `halonic doctor` shows the check's own sentence for `other` (and a code this version doesn't
  know), as "What failed:" and its first line, in place of "Halonic can't tell what the sandbox is
  missing.". The line has no colour codes or control characters, is cut at 200 characters with
  "…", and gets no full stop of its own. Without a sentence, the old reason stays. `run` and
  `runs send` are unchanged: the sentence shows there only with `--debug`.

## Tests and requirements this edits

- `apps/cli/src/messages/sandbox.test.ts`: the word-for-word lists for every code change
  `not-supported`'s line 2, reason and fix to the WSL 1 words. The lists still cover every code
  in the port's order; nothing is removed or skipped. New tests cover the distro's name, its
  quoting and the "What failed:" label.
- `cli.sandbox-gate`: "the words shall come from the code alone" gains the exception that the
  WSL 1 fix names the distro, with a new example.
- `cli.doctor-report`: gains the "What failed:" rule for `other` and the WSL 1 fix, with a new
  example. The example from cli-output 3.7 is unchanged.

## Covers

- cli.sandbox-gate
- cli.doctor-report
- cli.messages
