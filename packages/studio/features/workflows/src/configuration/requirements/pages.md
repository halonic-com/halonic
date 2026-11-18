# workflows.configuration.pages

- Status: draft
- Since: unreleased
- Source: HAL-9957 (T7 PR 4); G5 part 9; states F9, F10, F16 to F18; UX checklist 3.5; HAL-12800 (narrow window)

When a workflow's Configuration tab opens, the workflows feature shall show a vertical list of pages (General, Request form, Tests, Problems) with General picked, and beside it the picked page: General with the description, the first step and the file's path; Request form with whether the workflow is offered in the Inbox; Tests with the workflow's tests (`workflows.tests.page`); Problems with each problem as a row that links to its step; while the settings load a skeleton in the list and the page and "Loading *name*'s settings"; when they can't be read "Couldn't load *name*'s settings", the reason and **Try again**; the Configuration tab shall show the number of errors, and the Problems page the same number. While the window is narrower than `PHONE_MAX_WIDTH`, the list shall sit above the picked page at full width instead of beside it, with the page at full width under it, and the list shall come before the page in Tab order.

## Examples

- Given one error, then the tab reads "Configuration, 1 error" and Problems shows 1.
- Given no problems, then Problems says "No problems.".
- Given the person picks a problem's step, then the page goes to Flow with that card picked.
- Given the host can't read the settings, then the page says so and **Try again** reads them again.
- Given the arrow keys on the page list, then the picked page moves and focus follows it.
- Given a window 390 px wide, then the list sits above the page and both are as wide as the window.
