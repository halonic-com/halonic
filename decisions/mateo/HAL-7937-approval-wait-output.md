# Decision: a run waiting for a tool approval says what it asks and how to answer

- Requirements: `cli.run`, `cli.commands.runs.show`
- Task: HAL-7937, found by Maya while running the Examples recipes (HAL-971)
- Approval: the task asks for this change; Liam reviews it and signs this note as the CTO
- Kind: internal

## What changes

Only the end of the output of `halonic run`, `halonic runs show` and `halonic runs send` when a run waits for a connector tool approval. It now prints, after a blank line, one line `! Waiting for your approval: <agent> wants to use <tool>` for each call, oldest first, and the usual `Answer with:` line. With more than one approval, a line under it says `Each answer settles the first one listed.` The arguments stay in `--json`. Both requirements get a sentence for this; nothing they said before is removed or weakened.

## Why

The wait printed only `! Answer  Handbook reader · default`, with no tool and no way to answer. The tool arguments can be long and come from outside, so they are not printed. The words follow the existing "Waiting for you" lines (checked by Mara, HAL-2282).
