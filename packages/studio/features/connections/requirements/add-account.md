# connections.add-account

- Status: active
- Since: unreleased
- Source: HAL-18670 (the board's decision on HAL-18359: two Paperclip accounts on the same Paperclip); `agent-host.paperclip-add-account`

While a connection in Settings › Connections is connected, its row shall offer "Add another account". When the person presses it, the Studio window shall open the Connect dialog titled "Add another account", with the connection's address filled in, read-only, and the line "Connect another account on this Paperclip. Approve the sign-in in a browser where you're signed in to Paperclip as that account." When the person presses Continue, the dialog shall start a sign-in at that address for a new connection, which leaves the row's own connection as it was, and go on as the Connect dialog does (`connections.connect-dialog`). A row that is offline or signed out shall not offer it.

## Examples

- Given a connected "Paperclip · Halonic" at `https://paperclip.acme.test`,
  when the person presses Add another account, then Continue,
  then the engine is asked for a new connection at that address, and the dialog shows the phrase.
- Given that sign-in,
  when the board approves,
  then the dialog closes and Settings › Connections lists two connections.
- Given an offline connection and a signed-out one,
  when Settings › Connections opens,
  then neither row offers Add another account.
