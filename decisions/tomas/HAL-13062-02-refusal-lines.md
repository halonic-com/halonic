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

## Why

The CLI said "Halonic can't tell the cause yet" and "report it" for a refusal whose cause is known,
and told the person to trust the instructions with no way to do it (Julian's M2 on HAL-13057). With
the agent in the facts, `halonic run` and `halonic runs show` say why and name
`halonic trust instructions <agent>` (`cli.run-failed-instructions`).

## Covers

- app.run-failure
