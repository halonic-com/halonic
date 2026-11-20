# workflows.page.narrow-cards

- Status: draft
- Since: unreleased
- Source: HAL-13679 (a11y check HAL-13658, row RC1b; WCAG 1.4.10 at 200 %); decided by the team under HAL-2282

When the window is too narrow for a line of the start card's header, the run card's header or a row of the Runs tab, the workflows feature shall wrap that line instead of letting it scroll sideways: a card's **Close** stays at the header's top end and the run's state chip goes under its id, and a Runs row puts its summary and time on a second line under the chip and id, with the summary never cut to nothing.

## Examples

- Given a phone window at 200 % (195 CSS px wide), when the run card is docked, then **Close run** is inside the window and the card doesn't scroll sideways.
- Given the same window, when the start card is open for a workflow with a long name, then the name wraps and **Close** is inside the window.
- Given the same window, when the Runs tab lists a run, then its row doesn't scroll sideways and its summary shows on a line under the chip and id.
