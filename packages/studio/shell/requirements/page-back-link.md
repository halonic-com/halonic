# shell.page-back-link

- Status: active
- Since: 0.1.0
- Source: HAL-8433 (Noah's spec for HAL-8421), HAL-8446; board design decisions of 13 Nov (HAL-8416)

When a tab shows an item whose kind names the sidebar place that lists it, the shell shall show one small link above the page's title that goes up to that place, named after it and marked with a back arrow and named "Back to <place>" for a screen reader. The item page shall draw the link inside its own column, above the header, so a chat page that is as tall as its tab shall not scroll for it. The link shall be a real link element, so a Ctrl-click, a middle-click and "open in new tab" keep working: a click shall open the place in the same tab, and a Ctrl-click or a middle-click in a new tab next to it. The shell shall show one level only, never a trail, and nothing for Home, places, searches or kinds without a place. The window's title shall name the page itself, such as "Support reply", not its path.

## Examples

- Given the workflow "Support reply", whose kind lists in Workflows,
  when its tab shows,
  then "← Workflows" is above the title, and the window's title starts with "Support reply".
- Given that link,
  when the user clicks it,
  then Workflows opens in the same tab.
- Given that link,
  when the user Ctrl-clicks it,
  then Workflows opens in a new tab next to it and the page stays as it was.
