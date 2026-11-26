# shell.place-new-signal

- Status: active
- Since: unreleased
- Source: the read and unread rule approved by the board on HAL-19192 (26 Nov), Sofia's sketch G there (the sidebar counts what's new); Sofia's acceptance rows A3.1 and A3.2 on HAL-20100; built on HAL-19492

While a place's signal is a `new` signal above zero, the sidebar shall show its number after the place's name as it shows a count, and shall set the place's name semibold, as an unread row's title; a screen reader shall hear the signal's words after the name. While its value is zero, the sidebar shall show no number and the name at regular weight, and a screen reader shall hear only the name. A `count` signal shall leave the name at regular weight.

## Examples

- Given the Inbox's signal is 3 new, spoken "3 new, 8 waiting",
  when the sidebar shows the Inbox,
  then it shows "3" after a semibold "Inbox", and a screen reader hears "Inbox, 3 new, 8 waiting".
- Given the Inbox's signal is 0 new, with 8 waiting,
  when the sidebar shows the Inbox,
  then it shows no number, "Inbox" is regular weight, and a screen reader hears "Inbox".
