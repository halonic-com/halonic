# workflows.page.guide-card

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5, build notes 3); first-run-flow 3.2 and 10.2 R10

Where another feature provides a guide (`WorkflowGuideService`) that gives a card for the open workflow, the workflow page shall show that card on Flow while no run, start or step card is docked at the right: at the right of the canvas on the desktop, and above the canvas on a phone. The card shall be a region named by its title, show its lines (a line's label in strong text before it) and one primary button with the card's words, and it shall have no ✕. The button shall call the card's action, which may open the page's Run form. When the guide says its card changed, the page shall read it again; when the guide gives no card, the page shall show none.

## Examples

- Given a guide that gives "Your first run" with **Run your first workflow** for Support reply,
  when Support reply's page opens on Flow,
  then the card shows at the right of the canvas, with no ✕.
- Given that card,
  when the user presses **Run your first workflow** and the action opens the Run form,
  then the Run form is docked at the right and the guide card is gone until it closes.
- Given the user is on Configuration,
  when the page draws,
  then no guide card shows.
