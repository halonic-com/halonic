# Decision: a run refused for untrusted instructions gets its own facts and lines

- Approval: the way past the refusal is the board's C on HAL-10522; the package owner (Liam) approves this note in review
- Kind: user-visible

## What changes

`app.run-failure` grows: a `run.failed` for `instructions-not-trusted` that names the agent now gives
the facts `instructions-not-trusted` with that agent and, when the log says, whether other
instructions were trusted before, instead of `error` with the engine's own message. A log that names
no agent still gets `error`, as before. One sentence and one example are added to the requirement;
none was removed or weakened. In `run-failure.test.ts`, `instructions-not-trusted` leaves the list of
reasons that get the engine's message, and two tests take its place: one for the new facts, and one
that still gives the engine's message when the log names no agent.

`cli.commands.trust.instructions` changes wording only, after Sofia's check on HAL-14868: the
heading is "Trust check for coder's instructions" instead of "Instructions of coder", and the New,
Changed and Removed tags go at the end of a file's row, as `halonic trust` puts them. Nothing it
does changes; its tests check the new words and the tag's new place, and none was removed.

## Why

The CLI said "Halonic can't tell the cause yet" and "report it" for a refusal whose cause is known,
and told the person to trust the instructions with no way to do it (Julian's M2 on HAL-13057). With
the agent in the facts, `halonic run` and `halonic runs show` say why and name
`halonic trust instructions <agent>` (`cli.run-failed-instructions`).

Sofia's check also asked for the heading and the tags to match `halonic trust`, which shows "Trust
check for Acme (folder)" and tags at the end of a row.

## Covers

- app.run-failure
- cli.commands.trust.instructions
