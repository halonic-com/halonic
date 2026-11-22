# workflows.configuration.pages

- Status: draft
- Since: unreleased
- Source: HAL-9957 (T7 PR 4); HAL-15586 (C596 5, the first step's name); G5 part 9; states F9, F10, F16 to F18; UX checklist 3.5

When a workflow's Configuration tab opens, the workflows feature shall show a vertical list of pages (General, Request form, Tests, Problems; across the top in the phone layout, `workflows.configuration.pages-phone`) with General picked, and beside it the picked page: General with the description, the first step (named as its card on the canvas names it: its title, or its id when it has none) and the file's path; Request form with whether the workflow is offered in the Inbox; Tests with the workflow's tests (`workflows.tests.page`); Problems with each problem as a row that links to its step; while the settings load a skeleton in the list and the page and "Loading *name*'s settings"; when they can't be read "Couldn't load *name*'s settings", the reason and **Try again**; the Configuration tab shall show the number of errors, and the Problems page the same number.

## Examples

- Given Acme's Support reply, whose first step `read` is titled "Read the email", then General reads "First step" "Read the email".
- Given one error, then the tab reads "Configuration, 1 error" and Problems shows 1.
- Given no problems, then Problems says "No problems.".
- Given the person picks a problem's step, then the page goes to Flow with that card picked.
- Given the host can't read the settings, then the page says so and **Try again** reads them again.
- Given the arrow keys on the page list, then the picked page moves and focus follows it.
