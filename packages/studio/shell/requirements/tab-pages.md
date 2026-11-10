# shell.tab-pages

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); UX checklist part 1, 1.2 and 1.12 (HAL-1323); microcopy 19.2; a11y A3 and E2

The shell shall keep the pages of the last five active window tabs mounted, the active tab's page shown and the others hidden and inert, so switching back keeps their typed text; a tab that has closed, or that five more recently active tabs push out, shall lose its page. When the active tab changes, the shell shall give its page back its scroll position and the focus it last had, or else move the focus to its page's `h1`, including when its page wasn't mounted any more. While the focus is in the tab strip, the shell shall leave it there. When a tab moves on to another place, the shell shall draw that place as a fresh page, starting at the top. A page's `h1` shall only be found on the page that is shown.

## Examples

- Given tabs "Agents" and "Sorter", with text typed into a field on "Agents" and the focus in it,
  when the user switches to "Sorter" and back,
  then the text is still there and the focus is back in the field.
- Given "Sorter" was scrolled halfway down,
  when the user switches to another tab and back,
  then "Sorter" is scrolled halfway down again.
- Given six tabs, each made active in turn from the first,
  when the user switches back to the first,
  then its page is drawn afresh and the focus goes to its `h1`.
- Given the focus is on a tab in the strip,
  when Enter makes it active,
  then the focus stays on that tab.
- Given "Agents" scrolled halfway down,
  when the tab opens "Routines" in its place or goes Back,
  then the page it draws starts at the top.
- Given the focus is on a section tab inside the "Agents" page,
  when Ctrl Tab makes "Sorter" active,
  then the focus goes to the `h1` "Sorter".
