# shell.no-connections

- Status: active
- Since: unreleased
- Source: HAL-18954 (Overview with nothing connected, Sofia's team wording decision); HAL-17897 (the board supervisor's ask of 25 Nov: a clear "not connected" state, not a blank screen); words from Noah's table on HAL-17498, those of Settings › Connections with no connection.

The shell shall give places a "not connected" state: the Empty state "No connections" with the place's own line under it and a **Connect Paperclip** button that opens Settings › Connections, which it leaves out when the window can't open Settings.

## Examples

- Given a window that can open Settings,
  when a place shows the state with the line "Connect Paperclip to see who works on what and which work is blocked.",
  then it shows "No connections", that line and a "Connect Paperclip" button.
- Given that state,
  when "Connect Paperclip" is pressed,
  then Settings opens on its Connections section.
- Given a window that can't open Settings,
  when a place shows the state,
  then it shows "No connections" and its line, without a button.
