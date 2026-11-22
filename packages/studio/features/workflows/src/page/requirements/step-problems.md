# workflows.page.step-problems

- Status: draft
- Since: unreleased
- Source: HAL-15140 (C544-3, item 4 of Iris's flow check: the step with the error has no mark); HAL-15172 (the arrow's plate); flow-workflows 4.4; HAL-413; HAL-15171 (Noah: the line's width and cut); HAL-15816 (C633 2: the never-taken plate's tooltip in Studio's words)

When the checks find problems in a step, the workflows feature shall draw its card on the canvas with a border in the colour of its worst problem (danger for an error, attention for warnings alone) and, hanging from the card's bottom edge at the left, its first problem's line in a chip of that colour ("✕ Uses a missing agent"), at most 80px wide so it ends before the middle of the edge where the arrows leave, with its words cut short there and never its glyph, and whose tooltip holds each problem's full message, errors first, with the step named as its card names it. A screen reader shall hear the line in the card's name, after "Error" or "Warning". A problem about one of the step's arrows (`unknown-target`, `unguarded-shadow`) shall not mark the card, and a failed run's ring and the selection's ring shall take the place of the problem's border while they show.

When the checks find a problem about one of a step's arrows (`unknown-target`, `unguarded-shadow`), the workflows feature shall draw that arrow's label plate in the colour of its worst problem, with the problem line after the arrow's words ("approved · △ Never taken"), or alone on a plate of its own when the arrow has no words, and with each of the arrow's problems as the plate's tooltip, the step named as its card names it: for an arrow that's never taken, the same Studio sentence as its Problems row, about this arrow, "This arrow is never taken: an earlier arrow on <event> always matches first. Change the order or the conditions in Arrows on <step>'s card.", and for the other checks the core's full message. An arrow to a step that isn't there shall be drawn as a short dashed arrow out of the right side of its step's card, in its problem's colour, ending at its plate; each next such arrow of the same step shall end one plate lower.

## Examples

- Given the step `first`, titled "Ask a missing agent", uses the missing agent `nobody-here`, then its card has a danger border and the line "✕ Uses a missing agent", whose tooltip says `"Ask a missing agent" uses the agent "nobody-here", which its hub doesn't have`, and a screen reader names the card "Ask a missing agent AGENT STEP Start nobody-here Error: Uses a missing agent".
- Given a step that can't be reached and has a key it ignores, then its card has an attention border and the line "△ Can't be reached", whose tooltip holds both messages.
- Given a step with a warning and an error, then its border is danger and its line is the error's.
- Given a step whose only problem is an arrow to a missing step, then its card has no problem line.
- Given the step with the error is picked, then its card wears the selection's ring and keeps its problem line.
- Given a workflow with no problems, then no card has a problem line.
- Given the step `review`, titled "Check the reply", whose second arrow, labelled "approved", can never fire, then that arrow's plate is in attention and reads "approved · △ Never taken", its tooltip says "This arrow is never taken: an earlier arrow on answer always matches first. Change the order or the conditions in Arrows on Check the reply's card.", and the step's first arrow keeps a plain plate.
- Given the step `first` with an unlabelled arrow to the missing step `nowhere`, then a dashed danger arrow leaves the right side of its card and ends at a plate "✕ Goes to a missing step".
- Given an arrow to a step that isn't there and no problem found for it yet, then it isn't drawn.
