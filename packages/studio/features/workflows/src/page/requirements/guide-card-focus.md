# workflows.page.guide-card-focus

- Status: active
- Since: unreleased
- Source: HAL-13433 (Sofia's UX check C509-1); first-run-progress 5

When the Run form that a guide card's button opened closes, the workflow page shall give focus back to that button once the guide card shows again, and to the page's Run when the card doesn't come back. When the page's Run opened the form, closing it shall give focus back to Run, as before.

## Examples

- Given the guide card "Your first run" on Support reply,
  when the user presses **Run your first workflow** and then **Cancel** on the Run form,
  then the card shows again and **Run your first workflow** has focus.
- Given the same page,
  when the user presses the header's **Run** and then **Cancel**,
  then **Run** has focus.
