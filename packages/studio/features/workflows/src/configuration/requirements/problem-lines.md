# workflows.configuration.problem-lines

- Status: draft
- Since: unreleased
- Source: HAL-9957 (T7 PR 4); HAL-413 (problem lines); flow-workflows 4.4; UX checklist 3.5; HAL-15120 (C544 finding 10: a new step's problems in the file's words)

When the checks find problems in a workflow, the workflows feature shall write each one as its glyph (✕ for an error, △ for a warning) and a short line of about 25 characters that starts with a capital and leaves out the step's name, list errors before warnings, and for several problems on one card say "✕ 2 problems" or "△ 2 warnings"; a problem of the whole workflow shall be a sentence, and a check with no written line shall show the core's own message. Configuration › Problems shall show, for every problem, followed by the step it links to, a sentence in Studio's words for the checks a newly added step gets (`task-without-agent`, `dead-end`, `unreachable`, `wait-without-events`), which leaves out the step's name and says what to do, and the core's full message for the other checks.

## Examples

- Given a `dead-end` error on Review, then the card reads "✕ Has no way out"; the row on Configuration › Problems says "Has no way out. Add an arrow from it on its card, or make it an End.", then links to Review.
- Given a new agent step `step-1`, then its rows say "Has no agent, so every run fails here. Pick one on its card, or make it a Wait." and "Can't be reached: no arrow leads to it.", not the core's `agent: <id>`.
- Given a new wait step `wait-1`, then its row says "Gives a person no answers to pick, such as approve. Add them in the workflow's file.".
- Given an `unknown-gets` error, then its row shows the core's full message.
- Given a warning and then an error, then the error row comes first.
- Given `no-final`, then the card line reads "This workflow has no end step."; the Problems row shows core's message and has no step link.
- Given two warnings on one card, then the card says "△ 2 warnings"; given a warning and an error, "✕ 2 problems".
- Given a check with no written line, then the card shows the core's message.
