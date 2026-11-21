# workflows.page.step-problems

- Status: draft
- Since: unreleased
- Source: HAL-15140 (C544-3, item 4 of Iris's flow check: the step with the error has no mark); flow-workflows 4.4; HAL-413; HAL-15171 (Noah: the line's width and cut)

When the checks find problems in a step, the workflows feature shall draw its card on the canvas with a border in the colour of its worst problem (danger for an error, attention for warnings alone) and, hanging from the card's bottom edge at the left, its first problem's line in a chip of that colour ("✕ Uses a missing agent"), at most 80px wide so it ends before the middle of the edge where the arrows leave, with its words cut short there and never its glyph, and whose tooltip holds each problem's full message, errors first, with the step named as its card names it. A screen reader shall hear the line in the card's name, after "Error" or "Warning". A problem about one of the step's arrows (`unknown-target`, `unguarded-shadow`) shall not mark the card, and a failed run's ring and the selection's ring shall take the place of the problem's border while they show.

## Examples

- Given the step `first`, titled "Ask a missing agent", uses the missing agent `nobody-here`, then its card has a danger border and the line "✕ Uses a missing agent", whose tooltip says `"Ask a missing agent" uses the agent "nobody-here", which its hub doesn't have`, and a screen reader names the card "Ask a missing agent AGENT STEP Start nobody-here Error: Uses a missing agent".
- Given a step that can't be reached and has a key it ignores, then its card has an attention border and the line "△ Can't be reached", whose tooltip holds both messages.
- Given a step with a warning and an error, then its border is danger and its line is the error's.
- Given a step whose only problem is an arrow to a missing step, then its card has no problem line.
- Given the step with the error is picked, then its card wears the selection's ring and keeps its problem line.
- Given a workflow with no problems, then no card has a problem line.
