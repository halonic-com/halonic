# workflows.page.step-problems

- Status: draft
- Since: unreleased
- Source: HAL-15140 (C544-3, item 4 of Iris's flow check: the step with the error has no mark); flow-workflows 4.4; HAL-413

When the checks find problems in a step, the workflows feature shall draw its card on the canvas with a border in the colour of its worst problem (danger for an error, attention for warnings alone) and, hanging from the card's bottom edge at the left, its problem line in a chip of that colour ("✕ Uses a missing agent", or "✕ 2 problems" for several), whose tooltip holds each problem's full message, errors first, with the step named as its card names it. A screen reader shall hear the line in the card's name, after "Error" or "Warning". A problem about one of the step's arrows (`unknown-target`, `unguarded-shadow`) shall not mark the card, and a failed run's ring and the selection's ring shall take the place of the problem's border while they show.

## Examples

- Given the step `first`, titled "Ask a missing agent", uses the missing agent `nobody-here`, then its card has a danger border and the line "✕ Uses a missing agent", whose tooltip says `"Ask a missing agent" uses unknown agent "nobody-here"`, and a screen reader names the card "Ask a missing agent AGENT STEP Start nobody-here Error: Uses a missing agent".
- Given a step that can't be reached and has a key it ignores, then its card has an attention border and the line "△ 2 warnings".
- Given a step with a warning and an error, then its border is danger and its line reads "✕ 2 problems".
- Given a step whose only problem is an arrow to a missing step, then its card has no problem line.
- Given the step with the error is picked, then its card wears the selection's ring and keeps its problem line.
- Given a workflow with no problems, then no card has a problem line.
