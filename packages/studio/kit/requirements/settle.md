# kit.settle

- Status: active
- Since: unreleased
- Source: HAL-19496 (board report on HAL-10 and its addition, comment 910fe451: a card decided anywhere animates into its final state, then goes away); plan approved by Liam

The kit shall offer `useSettling`, which keeps an item that leaves a shown list of open items, as it is once it ended, until it is said to be gone; an item that had already ended when the list first showed, or that nothing knows the end of, shall not be kept, and one that opens again shall stop settling. The kit shall offer `useSettleAway`, which holds an element for 4 seconds, pausing while the pointer is over it or the focus is in it, also when either already is as the hold starts, and going on for what was left once both leave, then plays `settleOut` and says the element is gone; while the element goes, nothing in it shall take the focus. `settleOut` shall fade the element out over `--duration-fast` with `--ease-exit`, then close its height and the space above it over `--duration-base` with `--ease-standard`; the first element of a list shall close the next one's top margin instead, so nothing jumps when it is removed. While the person prefers reduced motion, `settleOut` shall only fade, over `--duration-fast`, with nothing moving; the 4-second hold shall stay.

## Examples

- Given a list showing an open card,
  when the card is answered,
  then the card settles with its answered state, and is gone once said so.
- Given a list whose first read holds an answered card,
  when it shows,
  then that card doesn't settle.
- Given a settling element,
  when 4 seconds pass,
  then it settles out and is gone.
- Given a settling element with the pointer over it for 10 seconds from its second second,
  when the pointer leaves,
  then it goes 3 seconds later.
- Given a settling element 16px below the one before it,
  when it settles out,
  then it fades, then its height and the 16px close.
- Given a settling element and a person who prefers reduced motion,
  when it settles out,
  then it only fades over `--duration-fast`.
- Given a settling element the focus is already in as it shows,
  when 12 seconds pass,
  then it is still there, and it goes 4 seconds after the focus leaves.
- Given a settling element that is the first of its list, with the next one 12px below it,
  when it settles out,
  then the next one's 12px close with it.
