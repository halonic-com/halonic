# shell.page-stopped

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2, PR 6c); microcopy 22 F13, F13b and F14; state coverage SH3; a11y 1.4

When a page throws while it draws, the shell shall show, in that page's area only, the error-tone Empty state "This page stopped working" with the reason "Halonic ran into a problem showing _page_. Nothing in your workspace changed.", where _page_ is the item's or the list's name, the button **Reload page** and the link **Copy details**, and the sidebar and the other tabs shall keep working. The error's own message shall never show on screen. When it shows and focus was lost, or as the user opens the page, where the shell would move focus to the page's `h1`, the shell shall move focus to its title; focus elsewhere, such as in the sidebar, shall stay. **Reload page** shall draw the page again from the start and, when that works, move focus to that page's own `h1`; when it fails again, focus shall go to the title, never to a heading outside the page. When the tab shows another page, the shell shall draw the new page afresh. **Copy details** shall put on the clipboard what stopped, then the error's name, message and stack, and then show the info toast "Copied. Paste it into a bug report.", or the danger toast "Couldn't copy." when the clipboard refuses. The toast shall leave out **Report a problem ›** until the Studio has a place it opens. In the desktop app, a Settings section whose view fails to load or draw shall show the same state, in that section only, with the title "Couldn't load these settings" one heading level below the section's name, the reason naming "the _section_ settings", **Reload page**, which draws the section again, and **Copy details**; the list and the other sections shall keep working. In the dialog, as the state shows, the shell shall read its title once through the dialog's polite region and leave the focus in the list. When Reload page draws the section, focus shall move to the section's name (the dialog's `h3`, the phone page's `h1`), unless the user moved it elsewhere meanwhile.

## Examples

- Given the Support reply page throws "steps is undefined" while it draws,
  when it shows,
  then the page area says "This page stopped working" and "Halonic ran into a problem showing Support reply. Nothing in your workspace changed.", without "steps is undefined", and the sidebar still works.
- Given focus is on Inbox in the sidebar,
  when the Agents page stops working,
  then focus stays on Inbox.
- Given the desktop app,
  when the user presses Enter on Agents in the sidebar and the Agents page stops working as it opens,
  then focus is on "This page stopped working".
- Given the page stopped working and would draw now,
  when the user presses Reload page,
  then the page shows and focus is on its `h1`.
- Given the page stopped working,
  when the user presses Copy details,
  then the clipboard holds "This page stopped working: Support reply" and "TypeError: steps is undefined", and the toast "Copied. Paste it into a bug report." shows.
- Given the Support reply page stopped working,
  when the tab opens another item,
  then that item's page shows, not "This page stopped working".
- Given the desktop app's Settings dialog,
  when the Appearance section throws while it draws,
  then the section says "Couldn't load these settings" as an `h4` under its `h3` "Appearance", and "Halonic ran into a problem showing the Appearance settings. Nothing in your workspace changed.", with Reload page and Copy details, and the Models section still shows.
- Given the desktop app's Settings dialog with the focus on the Appearance row,
  when the Appearance section throws as it loads,
  then the dialog's polite region reads "Couldn't load these settings" once and the focus stays on the row.
- Given the Appearance section says "Couldn't load these settings",
  when Reload page draws it,
  then the focus goes to its name "Appearance".
