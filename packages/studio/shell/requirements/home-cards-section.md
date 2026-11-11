# shell.home-cards-section

- Status: active
- Since: 0.1.0
- Source: HAL-1740; plugins design 8.2 and decision D3 (HAL-1739, HAL-1801); plugins UX checklist 8 and 16, B4 (HAL-1952); T16-F35 and F37

The shell shall let one feature add Home's Cards section through `home.addCard` with the section `cards`, and shall show it after Recent runs, with the heading "Cards" and, when its card can't load, the title "Couldn't load cards". While the Cards section loads, the shell shall show, after the same 300 ms, two skeleton cards instead of skeleton rows. When a section's card renders `HomeSectionEmpty`, the shell shall hide the whole section, its heading included, and shall show it again once the card renders something else.

## Examples

- Given _plugins_ adds Cards and _runs_ adds Recent runs, registered in that order,
  when Home is shown,
  then its sections read Recent runs, Cards.
- Given Cards' card fails to load,
  when Home is shown,
  then Cards shows "Couldn't load cards" with Try again.
- Given Cards is still loading,
  when 300 ms have passed,
  then it shows two skeleton cards, hidden from screen readers.
- Given Cards' card renders `HomeSectionEmpty` because no plugin has a card,
  when Home is shown,
  then there's no region named "Cards".
- Given Cards was hidden that way,
  when a plugin with a card is turned on and the card renders it,
  then the region "Cards" is there again.
