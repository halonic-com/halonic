# workflows.page.docked-card-body

- Status: draft
- Since: unreleased
- Source: HAL-14628 (a11y check HAL-14619, row DW1; WCAG 1.4.10 at 200 %); the phone layout approved in #3861, decided by the team under HAL-2282

When the workflow page's body is under 800 CSS px wide, so the view beside a 480 px docked card would get under 320 px, the workflows feature shall let the docked card (the start card, the waiting line, a run's card or a step's card) take the whole body and hide the view behind it, as on a phone, with **Close run** on the screen; at 800 px or wider the card stays 480 px beside the view. The Runs tab does the same with its list beside a run's card.

## Examples

- Given a 1280 px window at 200 % (a body of 640 CSS px), when a failed run's card is docked, then the card takes the body, the canvas is hidden and **Close run** is on the screen.
- Given the same window, when **Close run** is pressed, then the card closes and the canvas shows again.
- Given a body of 1000 CSS px, when a run's card is docked, then it is 480 px wide and the canvas beside it is 320 px or wider.
- Given a body under 800 CSS px, when a run's card is open on the Runs tab, then the list is hidden behind it.
