# inbox.final-state

- Status: active
- Since: unreleased
- Source: HAL-19496 (board report on HAL-10, comment 20e30d36, and its addition, comment 910fe451: a card decided anywhere animates into its final state, then goes away); plan approved by Liam; rows L4.1, L4.4, L4.5 and L3.8 and team decision G2 in HAL-20218's UX acceptance rows

When every card of an agent's row in Needs you ended while the Inbox showed it, because it was answered here, or decided, cancelled or expired anywhere else, the Inbox shall keep the row in its place, with its title muted and its line the final state in the kit's words (`kit.final-state`), such as "Answered by Liam · 10:00", "Cancelled · 10:00" or "Expired · 10:00", and a click on it shall open nothing. A row of several cards shall say how its card that ended last ended. The row shall leave the Needs you count and the new count at once. After 4 seconds, pausing while the pointer is over it or the focus is in it (`kit.settle`), it shall fade out, and the rows below shall glide up into its place (`inbox.list-motion`); while the person prefers reduced motion they shall take its place at once. Rows that ended in the same read shall hold and go together, in one motion (`kit.settle-together`). The Inbox shall read out once, where a screen reader hears it, one card's title and final state, such as "Ship the release?: Expired · 10:00", or for several cards one line, "3 cards ended: Cancelled" when they ended the same way, else "3 cards ended"; a card answered from its card here is not read out again.

## Examples

- Given Ada's open cards "Ship the release?" and "Merge #12?",
  when Liam answers the first in Paperclip at 10:00,
  then its row stays where it was and says "Answered by Liam · 10:00", and 4 seconds later it fades and "Merge #12?" glides up.
- Given two open cards,
  when one is cancelled and the other expires,
  then their rows say "Cancelled · 10:00" and "Expired · 10:00".
- Given one new open card,
  when it is cancelled,
  then the heading no longer says it waits or is new, and a click on its row opens nothing.
- Given a row that shows its final state,
  when the pointer stays over it for 8 seconds,
  then it is still there.
- Given the open card "Ship the release?",
  when it expires,
  then a screen reader hears "Ship the release?: Expired · 10:00" once.
- Given three open cards,
  when all three are cancelled in one read,
  then they hold together, go in one motion, and a screen reader hears "3 cards ended: Cancelled".
- Given two open cards,
  when one is cancelled and the other expires in one read,
  then a screen reader hears "2 cards ended".
