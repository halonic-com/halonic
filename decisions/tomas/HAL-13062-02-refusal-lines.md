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

`cli.commands.trust.instructions` changes what it shows, after Sofia's wording check on HAL-14868
and her UX pass on HAL-14879; what it pins, saves and refuses doesn't change:
- the heading is "Trust check for coder's instructions" instead of "Instructions of coder", and the
  intro starts at the left edge under it, as in `halonic trust`;
- each file's row names the workspace file a person reads ("Instructions" and the agent's file,
  "Skill review" and the skill's `SKILL.md`) instead of the run's own names (`AGENTS.md`,
  `skills/review/SKILL.md`), and the New, Changed and Removed tags go at the end of the row;
- after a yes it says "✓ coder's instructions are trusted on this computer." instead of "… are
  trusted. It can run now.": the first example changes to match;
- with no terminal, instructions that changed since they were trusted say so, instead of "aren't
  trusted on this computer yet": the requirement now names the three cases, and an example is added;
- the fix for `--yes` alone says "… to see the files and their fingerprint." instead of "… the
  fingerprint is above the question.";
- an agent with no `harness` gets "✓ writer runs in Halonic's own loop, so its instructions need no
  trust." and exit 0, instead of a trust that no check ever reads. A sentence is added for it.

Its tests check the new words; the two that read "It can run now." and the two that matched
`AGENTS.md` rows now check the new line and rows. Three tests are added (changed without a terminal,
a removed skill, an agent in Halonic's own loop); none was removed.

## Why

The CLI said "Halonic can't tell the cause yet" and "report it" for a refusal whose cause is known,
and told the person to trust the instructions with no way to do it (Julian's M2 on HAL-13057). With
the agent in the facts, `halonic run` and `halonic runs show` say why and name
`halonic trust instructions <agent>` (`cli.run-failed-instructions`).

Sofia's check also asked for the heading, the intro and the tags to match `halonic trust`, which
shows "Trust check for Acme (folder)" and tags at the end of a row. Her UX pass, run for real, found
that the rows named files the person doesn't have (`AGENTS.md` exists only in the run's own copy),
so there was nothing to read before trusting; that "It can run now." was printed while the workspace
itself wasn't trusted; that a CI log called changed instructions "not trusted yet"; and that an
agent in Halonic's own loop was offered a trust that does nothing. These are wording and detail
inside the board's approved flow (HAL-2282), decided by Sofia and Tomas on HAL-14879.

## Covers

- app.run-failure
- cli.commands.trust.instructions
