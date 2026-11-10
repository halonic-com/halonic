# shell.card-stack

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); req-shell `shell.cards.open-on-top`, `shell.cards.go-back`, `shell.cards.drop-gone-items` and `shell.cards.docked-card` (HAL-110); UX checklist part 1, 1.10 (HAL-1323); a11y 6.5 (HAL-950)

The shell shall keep an item page's stacked cards as a stack, the bottom card first, where opening a card puts it on top and opening a card already in the stack goes back to it, closing the cards above it. The stack shall show the top card and at most two cards behind it. When the user goes back to a card or the item itself, the stack shall close every card above that level, and Esc, the ← arrow or the empty room round the cards shall close the top card. If the part a card shows no longer exists, then the stack shall drop that card and every card above it, and say which card was removed. A docked card shall always be the only card at the bottom of the stack, so opening one closes every card open, a docked one included, and in a panel narrower than 720px it shall cover the whole panel. The top card's title shall be named with its path, "draft-reply, in Acme Mail › Writer › draft-reply".

## Examples

- Given agent "Writer" in hub "Acme Mail",
  when the user opens its task "draft-reply",
  then "draft-reply" is on top and the breadcrumb reads "Acme Mail › Writer › draft-reply".
- Given cards "fact-checker" and "sources" above it,
  when the user opens "fact-checker" again,
  then "sources" closes and "fact-checker" is on top.
- Given 4 cards,
  then only the top one and the 2 below it are shown.
- Given cards "A", "B" and "C",
  when the user picks "A" in the breadcrumb,
  then "B" and "C" close.
- Given card "draft-reply" open on agent "Writer",
  when the user presses Esc,
  then "draft-reply" closes and the panel shows Writer.
- Given cards "check" (a step) and "check → reply" (its arrow),
  when step "check" is removed,
  then both cards close and "check was removed." is the card to announce.
- Given a docked card "triage" and a card "Sorter" above it,
  when the user opens step "reply" as a docked card,
  then "Sorter" and "triage" close and "reply" is docked.
- Given a panel 700px wide,
  then a docked card covers the whole panel.
