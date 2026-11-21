# workflows.page.guide-card

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5, build notes 3); first-run-flow 3.2 and 10.2 R10; sheet 05 (HAL-8721), design check C520-6 to C520-8 (HAL-14976)

Where another feature provides a guide (`WorkflowGuideService`) that gives a card for the open workflow, the workflow page shall show that card on Flow while no run, start or step card is docked at the right: at the right of the canvas on the desktop, and above the canvas on a phone. The card shall be a region named by its title, with its own border and corners, as tall as its content, at the top beside the canvas on the desktop, and its title over a divider. It shall show its lines, a labelled line as a quote in an inset box with a bar at its start and the label small above the text, then one full-width primary button with the card's words and a › after them, or the refresh mark before them when the action runs something again (`again`). It shall have no ✕. The button shall call the card's action, which may open the page's Run form; while the page's Run is unavailable or missing, that shall do nothing, as Run does. When the guide says its card changed, the page shall read it again; when the guide gives no card, the page shall show none.

## Examples

- Given a guide that gives "Your first run" with **Run your first workflow** for Support reply,
  when Support reply's page opens on Flow,
  then the card shows at the right of the canvas, with no ✕, and its button is full width with a ›.
- Given the card's action runs something again, "Run again",
  when the card shows,
  then its button shows the refresh mark before "Run again" and no ›.
- Given that card,
  when the user presses **Run your first workflow** and the action opens the Run form,
  then the Run form is docked at the right and the guide card is gone until it closes.
- Given the user is on Configuration,
  when the page draws,
  then no guide card shows.
