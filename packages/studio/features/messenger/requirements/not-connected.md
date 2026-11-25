# messenger.not-connected

- Status: active
- Since: unreleased
- Source: HAL-17897 (the board supervisor's ask of 25 Nov: Inbox and Messenger show a clear "not connected" state, not a blank screen); wording from Noah's table on HAL-17498, the words of Settings › Connections with no connection.

While `AgentMessaging` lists no source, the Messenger shall show "No connections" and "Connect Paperclip to answer your agents' cards and chat with them from Inbox and Messenger." in its panel, with a "Connect Paperclip" button that opens Settings › Connections when the window can open Settings.

## Examples

- Given a workspace with nothing connected,
  when the Messenger is opened,
  then its panel shows "No connections" and a "Connect Paperclip" button.
- Given that page,
  when "Connect Paperclip" is pressed,
  then Settings opens on its Connections section.
- Given a connected Paperclip with no chats,
  when the Messenger is opened,
  then it shows "Pick a chat to read it." and not "No connections".
