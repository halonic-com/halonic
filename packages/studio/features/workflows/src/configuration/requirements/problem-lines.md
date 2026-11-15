# workflows.configuration.problem-lines

- Status: draft
- Since: 0.1.0
- Source: HAL-9957 (T7 PR 4); HAL-413 (problem lines); flow-workflows 4.4; UX checklist 3.5

When the checks find problems in a workflow, the workflows feature shall write each one as its glyph (✕ for an error, △ for a warning) and a short line of about 25 characters that starts with a capital and leaves out the step's name, list errors before warnings, and for several problems on one card say "✕ 2 problems" or "△ 2 warnings"; a problem of the whole workflow shall be a sentence, and a check with no written line shall show the core's own message. Configuration › Problems shall show the core's full message for every problem, followed by the step it links to.

## Examples

- Given a `dead-end` error on Review, then the card reads "✕ Has no way out"; the row on Configuration › Problems shows core's full message, then links to Review.
- Given a warning and then an error, then the error row comes first.
- Given `no-final`, then the card line reads "This workflow has no end step."; the Problems row shows core's message and has no step link.
- Given two warnings on one card, then the card says "△ 2 warnings"; given a warning and an error, "✕ 2 problems".
- Given a check with no written line, then the card shows the core's message.
