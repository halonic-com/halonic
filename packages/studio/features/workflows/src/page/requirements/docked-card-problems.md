# workflows.page.docked-card-problems

- Status: draft
- Since: unreleased
- Source: HAL-15435 (Iris's flow check C575, finding 1, on HAL-15423: the step card that opens doesn't say what's wrong, and the full message is only a tooltip); flow-workflows 4.4

When a step the checks found problems in is picked, the workflows feature shall show at the top of its docked card, under the breadcrumb, a Callout in the colour of its worst problem (danger for an error, attention for warnings alone) with each of the step's problems in the words of Configuration › Problems, errors first, and a list with each problem's glyph when there are several. While the **Agent** field shows an agent the step's hub doesn't have (`unknown-agent`), it shall be marked invalid with "Pick one of this hub's agents." and be described by that problem's sentence in the Callout too, so a screen reader hears the "Did you mean …" with the field; a new pick takes the mark away. The step's card on the canvas shall give its problems' full messages as its description (`aria-describedby`), before where it leads, as well as its problem line's tooltip.

## Examples

- Given the step `write`, titled "Write the report", uses the agent `reportr`, which the hub doesn't have, and the core guesses `reporter`,
  when its card on the canvas is picked,
  then the docked card says `"Write the report" uses unknown agent "reportr". Did you mean "reporter"?` in a danger Callout under the breadcrumb, and the Agent field is invalid, says "Pick one of this hub's agents." and is described by that sentence.
- Given the same step,
  when **Reporter** is picked in the Agent field,
  then the field is no longer marked invalid.
- Given a step that can't be reached and has a key it ignores,
  when it is picked,
  then the Callout is in attention and lists "△ Can't be reached: no arrow leads to it." and the other warning.
- Given a step with no problems,
  when it is picked,
  then its docked card has no Callout.
- Given the step with the missing agent,
  then its card on the canvas is described by `"Write the report" uses unknown agent "reportr". Did you mean "reporter"?` and then where it leads.
