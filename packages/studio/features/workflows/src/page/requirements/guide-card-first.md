# workflows.page.guide-card-first

- Status: draft
- Since: unreleased
- Source: HAL-17218 (C46 FR1, keyboard and screen-reader check on HAL-17209); WCAG 2.4.3

While a guide card (`workflows.page.guide-card`) shows at the right of the canvas, the workflow page shall put it before the canvas in the reading and Tab order, so Tab reaches the card's button before the canvas's step cards and zoom buttons, and shall still draw it at the canvas's right.

## Examples

- Given the first run's guide card "Your first run" on the demo's Support reply page,
  when the user tabs from the page's title,
  then **Run your first workflow** comes before the canvas's first step card, and the card still shows at the right.
