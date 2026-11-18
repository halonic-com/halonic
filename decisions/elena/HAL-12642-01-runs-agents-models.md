# Decision: Studio's Runs, Agents and Models lines say what the app and engine do

- Task: HAL-12642
- Approval: team decision under the HAL-2282 rule for small wording on approved screens; Liam reviews the pull request on HAL-12642 and signs this note
- Kind: user-visible

## What changes

The claims check C52 (HAL-12632) found lines in Studio that don't match `main`. This note covers the wording (W) and dead-string (D) items for Runs, Claude Code and Codex agents, Agents, and Models. The empty lines on Home and in the Runs list (1.1 to 1.4) come from HAL-12371 (#3592), which builds the lines approved in microcopy revision 109, so this note leaves them alone:

- The "Run this routine from the command line" fix for an agent routine is gone (1.7): the toast never showed it, and the CLI can't run a routine.
- A workflow with a Claude Code or Codex agent that this window can't start says to set the agent to Halonic on its Harness page (2.1), and an agent set to "this computer" says Halonic can't run those agents outside the sandbox yet, and to set it back to the sandbox (2.2). The CLI refuses those agents too, so the command line was no fix.
- Agents: "Turn limit" is "Model call limit", counted per step, and Claude Code and Codex agents don't use it (5.1); the Instructions hint drops "and chat" (5.2); the Runs part of the agent page says runs aren't listed by agent yet (5.3).
- Models: How the budget works says the budget is checked before each step, that Claude Code and Codex calls on the person's own sign-in don't count, and that a run and every child run under it share one per-run budget (6.1 to 6.3). The fallback hint names when a fallback is tried (6.4), a local alias "Runs locally" (6.5), the Check hint suggests a short run (6.7), and the sample card's button is "See its tests", since it only opens the Tests page (6.8). The unused `NO_SECRET` is gone (6.9).

The requirements `agents.configuration.behaviour`, `agents.configuration.model`, `agents.page.frame`, `first-run.sample-card`, `models.aliases.edit-fallbacks` and `models.providers.check` change their quoted text to match. `models.budget-step.ask-for-pay-per-use` gains one example for How the budget works, with a new test. No test was skipped, and every changed test still checks the line the screen shows.

## Why

The old line for child runs said the opposite of what the engine does: `spendOf` in `packages/core/engine/src/budget/spend.ts` counts "the cost of the top-level run and of every child run under it" (`engine.budget-stops`). The other lines sent people to a command line that refuses the same work, or named a page, a chat or a count that doesn't exist. These are small wording fixes on screens the board already approved, so the team decides them (HAL-2282).

## Covers

- agents.configuration.behaviour
- agents.configuration.model
- agents.page.frame
- first-run.sample-card
- models.aliases.edit-fallbacks
- models.budget-step.ask-for-pay-per-use
- models.providers.check
