# inbox.notice-bell

- Status: active
- Since: unreleased
- Source: Sofia's proposal on HAL-19491, part (c), approved by the board on 26 Nov; built on HAL-20150

The Inbox shall start every row in Notices with the kit's bell (`KindIcon` `notice`, `kit.avatar-badge`) on the same 60px neutral tile as the marks of Needs you's own items (`inbox.row-marks`), with no badge, since Halonic itself tells. The bell is decoration, hidden from screen readers: the row's title says what happened.

## Examples

- Given the notice "Daily summary failed at 06:00",
  when you open the Inbox,
  then its row starts with a bell on the 60px tile, with no badge, before its title.
- Given the month's budget notice and a failed-run notice,
  when you open the Inbox,
  then both rows start with the bell.
