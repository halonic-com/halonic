# inbox.waiting-time

- Status: active
- Since: 0.1.0
- Source: HAL-1218; flow-inbox (HAL-877) 3.2 and 4.1; card requirements (HAL-64) INBOX-CARD-15; microcopy (HAL-751) 10.2; ux-checklists-approvals (HAL-1250) 2.4; HAL-16895 (C348: no break in "10 min"); the board-approved HAL-19192 sketches as Sofia's design check on HAL-20395 read them (task HAL-20396)

The Inbox row shall say how long an item has waited at its top right, as the Messenger's rows say their time: "1 min" (also under a minute), "6 h", "2 days", heard as "Waiting 1 min", "Waiting 6 h", "Waiting 2 days". The number and its unit shall be joined by a no-break space, so they never split. The card shall say since when, from the time the approval was asked or the run last started waiting, never the run's start: "Waiting since 10:42 (1 min)", "Waiting since 01:50 (6 h 40 min)". Before today it adds the day, "Waiting since Sat 10:42 (2 days)", and from 6 days on the date, "Waiting since Sat 31 Oct, 10:42 (8 days)". From 24 hours on the item is late: the row shows its waiting time in amber with a dot before it, heard with ", late" after it. A tool approval has no timer; only a wait step with a timer says "Moves on by itself on Mon 9 Nov, 14:00." and adds "moves on Mon 14:00" to its row.

## Examples

- Given an approval asked at Sun 8 Nov 10:42,
  when it's 10:43,
  then the row reads "1 min", heard as "Waiting 1 min", and the card "Waiting since 10:42 (1 min)".
- Given the same approval,
  when it's Tue 10 Nov 11:00,
  then the row reads "2 days" in amber with a dot, heard as "Waiting 2 days, late", and the card reads "Waiting since Sun 10:42 (2 days)".
- Given a wait step whose timer moves it on at Mon 9 Nov 14:00,
  when the card shows it,
  then it reads "Moves on by itself on Mon 9 Nov, 14:00."
