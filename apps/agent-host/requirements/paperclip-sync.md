# agent-host.paperclip-sync

- Status: active
- Since: unreleased
- Source: the sync service design approved by the maintainer on HAL-19201, with the maintainer's conditions and the addendum on HAL-19342 (PR 3, HAL-19335)

When the agent host syncs a Paperclip connection, it shall read the connection's agents, conversations, inbox items and work through the provider's sync collections, which hold only the `AgentMessaging` port's types, and keep them as the connection's local copy, in memory and in files only the user can read (0600 in a 0700 folder) in the workspace's messaging cache folder, outside every workspace. Once a sync has filled the local copy, the agent host shall answer reads of those four lists from it without a request to Paperclip, and name the source on `AgentMessaging.changes` when a sync changed it or the source accepted a write, and not after a sync that changed nothing. The agent host shall still send every answer, message and channel change to Paperclip, apply an accepted answer or message to the local copy at once, also when a sync that started before it lands after it, and read a conversation's messages and every search from Paperclip, because the local copy holds open work only. Each saved collection shall record its store format, port version, mapping version and watermark: a file of another store format or port version shall count as missing, and a copy made by another mapping version shall be served until a sync reads the collection whole again. Disconnect shall delete the connection's local copy, and a sync, answer or send still in flight shall not write it again.

## Examples

- Given a connection synced once, when the Inbox and the Messenger read their lists,
  then Paperclip gets no request.
- Given a connection synced once, when the person searches,
  then the search goes to Paperclip.
- Given a synced connection, when the agent host writes its local copy,
  then each file has mode 0600 in a folder with mode 0700, outside every workspace.
- Given a synced connection, when the person disconnects it,
  then its local copy's files are gone.
- Given a card answered in Studio, when the next read comes before a sync,
  then the card reads as answered.
- Given a sync that read a card before the person answered it, when that sync lands after the answer,
  then the card still reads as answered.
- Given a sync still reading Paperclip, when the person disconnects and the read then ends,
  then no file of the local copy is left.
- Given a saved copy made by an older port version, when the agent host starts,
  then the copy counts as missing and the lists are read from Paperclip.
