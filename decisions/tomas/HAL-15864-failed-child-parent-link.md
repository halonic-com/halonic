# Decision: a failed child run leads to the run that started it

- Task: HAL-15864
- Approval: HAL-15864; Liam reviews this pull request and signs this note as the CTO (a team decision under HAL-2282: flow check C642 #3 on HAL-15857 asks for the way back that #4855 gave a cancelled child, with no new words)
- Kind: user-visible

## What changes

A failed run that another run started, such as a `workflow` step's run or a for-each item's run,
now leads back to the run that started it, as a cancelled one already did (HAL-15755):

- `halonic runs show`: under the failure lines, before the receipt, "See the run that started it:
  halonic runs show 22d0be", with the user's `--dir`. A run whose own child failed keeps "See that
  run: …" for the child, and this line follows it.
- Studio's run page: the failed banner ends with **Open run** and the parent's short id, after its
  other buttons. Run again and the cause's fixes stay as they are. The three banners with their own
  layout (instructions not trusted, sandbox not ready, blocked sites) don't get it yet.

While there: an answer that isn't one of the step's options now names the agent as its file does in
`runs show`, "The agent Picker answered …", as the step line above it and Studio already do. The
typed cause names the agent, so only that id in the engine's line is swapped; a log without the
cause keeps the id.

## Why

C642 #3 (HAL-15857): `halonic runs show` of a failed child ended on "Sent nothing" with nothing
leading to its parent, and Studio gave **Open run** to a cancelled child only. #4855's own note
called that a dead end. The words are the ones the cancelled child already uses, so nothing new is
said.

## Tests

No test was removed or weakened. New tests: `show-child-failed.test.ts` (the parent line with and
without `--dir`, the agent's name on the child's and the parent's run, an older log keeping the
id), `run-page-model.test.ts` (`withParentRun`), and `run-page-failed-child.test.tsx` (the item's
own page opens the parent from **Open run**, after Run again).

## Covers

- runs.run-page
- cli.commands.runs.show
