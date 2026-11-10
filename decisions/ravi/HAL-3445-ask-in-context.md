# Decision: commands ask through `context.ask`, with lines shown first

- Requirement: `cli.questions` (`apps/cli/requirements/questions.md`)
- Task: HAL-3445, for `halonic trust` (HAL-188, stack 4); wiring part of HAL-2184 (F5, F6)
- Approval: the maintainer approves this note in review

## What changes

`CommandContext` gets `ask(question)`, built on `askYesNo`, as `command.ts` already promised
(Liam, HAL-2194). The command passes the question, whether its `--yes` answered it and its
refusal; `runCli` owns stdin, stderr and `canAsk`. A command may call it more than once:
`trust` asks a second question for a program that isn't pinned.

The question can carry `shownFirst` lines, written to stderr in its style right before the
question. That keeps the rule that a command never writes to the screen itself, and the lines
appear only when the question is really asked: not with `--yes`, and not when it refuses, since
the refusal error prints its own check. The other option, a way to write stderr lines in the
middle of a run, would let any command print outside its result.

A live ◌ line is taken away before the question, so the question and the typed answer have the
line to themselves; a command ends its step's live line before asking.

`main.ts` reads stdin a line at a time and pauses it between questions, so a command that asks
nothing never holds the process open, and two answers typed at once answer two questions.

The requirement gains two sentences and two examples for this. cli-output 1.7 says how a question
is asked, not what comes before it; showing the trust check first follows cli-output 3.5, so the
team decides it (board, HAL-2282).

## Tests

No guard was weakened. The existing examples keep their tests; new tests cover the lines shown
first, two questions in one run, the live line taken away first, refusing with `--json` and in CI, and the line reader.
