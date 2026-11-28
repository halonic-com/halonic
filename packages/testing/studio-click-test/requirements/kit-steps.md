# studio-click-test.kit-steps

- Status: active
- Since: unreleased
- Source: HAL-20752, the review of PR #6857 (HAL-20727)

When the step of `studio-click-test.files-tree-step` has run, the click test shall check the kit's Menu, Toast, Dialog and Tooltip on the installed app, in order:

1. **A file's menu and a toast:** in a 1280 × 800 window, the sidebar's Studio | Files switch shows the Files view, and a click on its first file row opens that file. The ⋮ in the file's header opens a kit Menu: the ⋮ has `aria-expanded="true"` and the menu that names it in `aria-labelledby` has a `display` other than `none`; Escape sets them back to `"false"` and `none` (`kit.menu`). That menu's Copy path then shows a toast in the `section` named "Notifications", "Copied …" or "Couldn't copy the path.", and the toast's close button removes it (`kit.toast`).
2. **A dialog:** in the same window and view, New file opens an open `<dialog>` named by its "New file" heading, and Escape closes it (`kit.dialog`).
3. **A tooltip:** in a 1280 × 800 window, New tab makes a second tab; after a click on the last tab, ArrowLeft moves keyboard focus to the tab before it, whose tooltip's `display` is then other than `none`, and Escape makes it `none` again (`kit.tooltip`). Ctrl W then closes a tab, so the strip has the tabs it had.

The first two steps shall switch the sidebar back to Studio at the end, pass or fail, so the sidebar shows the places again as it did before them. Each shall fail with its own code, such as `MENU_NOT_OPEN`, `NO_TOAST`, `DIALOG_STAYED` or `NO_TOOLTIP`, and the screen's last words.

## Examples

- Given a ⋮ whose own menu stays `display: none` after the click,
  then the menu step fails as `MENU_NOT_OPEN`, its note ends with the screen's last words, and the sidebar is back on Studio.
- Given a ⋮ whose menu leaves `aria-expanded="true"` after Escape,
  then the menu step fails as `MENU_NOT_CLOSED`.
- Given a Copy path whose clipboard refused, so the toast says "Couldn't copy the path.",
  then the menu step still passes once the toast's close button removes it.
- Given a New file dialog that stays open after Escape,
  then the dialog step fails as `DIALOG_STAYED`.
- Given a tab whose tooltip stays `display: none` on keyboard focus,
  then the tooltip step fails as `NO_TOOLTIP` with the screen's last words, and Ctrl W still closes the new tab.
