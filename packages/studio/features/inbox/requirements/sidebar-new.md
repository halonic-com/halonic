# inbox.sidebar-new

- Status: active
- Since: unreleased
- Source: the read and unread rule approved by the board on HAL-19192 (26 Nov), Sofia's sketch G there (the sidebar counts what's new); Sofia's acceptance rows A3.1 and A3.2 on HAL-20100; built on HAL-19492

The Inbox place's signal in the sidebar and the phone's bar shall be a `new` signal (`shell.place-new-signal`): how many of the Inbox's items that wait are new by their read marks (`inbox.read-marks`), heard as "3 new, 8 waiting" after the place's name. While none of them is new, it shall be zero, so the sidebar shows no number and a screen reader hears only "Inbox", though items still wait. The sidebar shall read it again whenever the Inbox's items or a read mark change. Home's Needs you shall keep counting every item that waits (`inbox.count`).

## Examples

- Given three items that wait, one of them opened,
  when the sidebar shows the Inbox,
  then it shows "2" after a semibold "Inbox", heard as "Inbox, 2 new, 3 waiting".
- Given two items that wait, both opened,
  when the sidebar shows the Inbox,
  then it shows no number and a screen reader hears "Inbox".
- Given one new item,
  when you open it,
  then the sidebar's count goes from 1 to nothing at once.
