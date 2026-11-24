# first-run.pick-model-focus

- Status: draft
- Since: unreleased
- Source: HAL-17218 (C46 FR2, keyboard and screen-reader check on HAL-17209); WCAG 2.4.3

When the Pick a model screen replaces Support reply's page during the first run (`first-run.run`), the First Run feature shall move the focus to its heading "Pick a model", drawn with the kit's focus ring, so the next Tab starts on the screen and not at the top of the window.

## Examples

- Given the browser demo's Support reply page,
  when **Run your first workflow** is pressed,
  then the focus is on the heading "Pick a model", and Tab goes next to the screen's options.
