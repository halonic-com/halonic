# team.spend-and-seats

- Status: active
- Since: unreleased
- Source: HAL-17629; the board's approval of the phase 2 card (HAL-17544, 24 Nov), with Choice S1 showing tokens as the second line of Spent today; Sofia's flows on HAL-17510 (1.1 and table 1.6); Noah's renders and `wording` table on HAL-17515, checked by Nina on HAL-17547.

The Spend and seats screen shall show, from `TeamStatus`, Needs you with each seat problem worst first, the Spent today, This month and Seats this week tiles, and the seats worst first. Spent today shall show paid money, "At least" while runs aren't priced, and the tokens used today on its second line. It shall show each state of Sofia's table 1.6 that `TeamStatus` tells apart, in the words of the HAL-17515 table, shall leave "Loading…" when a read fails, and shall never act itself: each action opens Paperclip or the connection flow.

When a read fails after a good one, or the engine answers from its offline cache, the screen shall show the "Offline, as of …" banner with the time of the last good reading (the newest cached answer's), keep the numbers, and turn its link buttons off until Paperclip answers again. A seat whose newest read failed shall show the cause and its last good time in its row, with the last good numbers greyed. Spent today shall say how many runs have no known seat. The sidebar shall show the screen as Spend and seats in the Team group, with the problems in Needs you as its signal, leaving out the quiet 80% ones. Where nothing in Studio can open a Paperclip page, the screen shall draw no link buttons.

## Examples

- Given a month with no budget set,
  when the screen opens,
  then This month says "$977 this month · No monthly budget set" with **Set one in Paperclip ↗**.
- Given today's spend of $41.20 with 560 runs not priced and 41 million tokens,
  when the screen opens,
  then Spent today says "At least $41.20 · 560 runs not priced yet" and "Subscription seats used 41M tokens today."
- Given seats last read 42 minutes ago,
  when the screen opens,
  then it says "Seat readings are 42 min old. The seats job may have stopped." with **Open AI seats ↗**.
- Given a source that serves spend but no seat use,
  when the screen opens,
  then the seats section says "Seat use isn't available on this Paperclip yet." with **Open Paperclip ↗**, and money still shows.
- Given the first read of `TeamStatus` fails,
  when the screen opens,
  then it says "Paperclip isn't answering." with **Try again**, never "Loading…" for good.
- Given a Studio where nothing serves `TeamStatus`,
  when a workspace opens,
  then it opens, and the screen says seat use isn't available.
- Given the engine answers from its offline cache, with spend as of 12:10 and a seat as of 12:20,
  when the screen opens,
  then it says "Offline, as of 12:20. Numbers stay as they were; …" and keeps the numbers.
- Given the Offline banner shows,
  when the board presses **Set one in Paperclip ↗**,
  then nothing opens: the button is off, and **Try again** still works.
- Given a seat whose newest read was rate-limited and whose last good reading was at 12:20,
  when the screen opens,
  then its row says "? Not read · rate-limited · last good 12:20" with the last good numbers, greyed.
- Given 3 of today's runs have no known seat,
  when the screen opens,
  then Spent today says "Seat unknown for 3 runs".
- Given one seat signed out, one at 94% and one at 82% of its week,
  when the sidebar shows Spend and seats,
  then its signal is "! 2", heard as "2 problems".
