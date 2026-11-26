# studio-click-test.connections-steps

- Status: active
- Since: unreleased
- Source: HAL-18868 (HAL-18716 point 6, the board's yes on 25 Nov: backfill the Connections requirements)

The click test shall check Settings › Connections through Studio's windows straight after Connect Paperclip, before any other step (a restart after a failing step signs its connection out), in order, each skipped when Connect Paperclip didn't pass:

1. **Account switcher:** the switcher at the sidebar's bottom left opens its menu, "Show Inbox and Messenger for" with Settings › Connections, and that row opens the Connections section with the connection's row.
2. **Connection row:** the row reads Read-only and Connected, offers no Sign in again, says what its key can do, and its label names the user it is signed in as ("Paperclip · <company> · <user>").
3. **https only:** Connect Paperclip with `http://paperclip.acme.test` says "Use an https address. Plain http works only for this computer (localhost)." on the field, and the dialog's close button closes it.
4. **Add another account:** the connected row's Add another account opens its dialog with its lead, Continue starts a sign-in, and once the test Paperclip approves it Settings › Connections lists two connections. The step then disconnects the second one and passes once the section says its key is revoked and that row reads Signed out (Disconnect keeps the workspace's connection file), so step 3's connection is the only connected one, as it was.

## Examples

- Given a sidebar with no account switcher,
  then the account switcher step fails as `NO_SWITCHER`.
- Given a row labelled "Paperclip · Acme Click Test" alone,
  then the connection row step fails as `NO_USER_NAME`.
- Given a Connect dialog that starts a sign-in at `http://paperclip.acme.test`,
  then the https step fails as `NOT_REFUSED`.
- Given a second sign-in the test Paperclip approved but that Settings › Connections never lists,
  then the add-account step fails as `NO_SECOND_ACCOUNT`.
