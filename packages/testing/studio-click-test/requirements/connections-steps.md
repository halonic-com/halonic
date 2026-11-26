# studio-click-test.connections-steps

- Status: active
- Since: unreleased
- Source: HAL-18868 (HAL-18716 point 6, the board's yes on 25 Nov: backfill the Connections requirements); HAL-19839 (the restart step, plan approved by Liam on HAL-19832: the board's acceptance for HAL-18910)

The click test shall check Settings › Connections through Studio's windows straight after Connect Paperclip, before any other step (a restart after a failing step used to sign its connection out, HAL-19027), in order, each skipped when Connect Paperclip didn't pass:

1. **Account switcher:** the switcher at the sidebar's bottom left opens its menu, "Show Inbox and Messenger for" with Settings › Connections, and that row opens the Connections section with the connection's row.
2. **Connection row:** the row reads Read-only and Connected, offers no Sign in again, says what its key can do, and its label names the user it is signed in as ("Paperclip · <company> · <user>").
3. **A restart keeps the sign-in:** the click test first closes every Halonic process and starts Halonic again through the Start menu's Halonic shortcut, whether or not the step before passed. Then, on the reopened demo, Settings › Connections reads Connected within 30 s and offers no Sign in again, and the Start menu's Halonic Messenger shortcut opens a window that lists the seeded chat, not No connections. If Halonic doesn't start again, the step fails as `NO_RESTART` and the steps after it are not run.
4. **https only:** Connect Paperclip with `http://paperclip.acme.test` says "Use an https address. Plain http works only for this computer (localhost)." on the field, and the dialog's close button closes it.
5. **Add another account:** the connected row's Add another account opens its dialog with its lead, Continue starts a sign-in, and once the test Paperclip approves it Settings › Connections lists two connections. The step then disconnects the second one and passes once the section says its key is revoked and that row reads Not connected or Signed out (Disconnect deletes its key but keeps the workspace's connection file), so step 3's connection is the only connected one, as it was.

## Examples

- Given a sidebar with no account switcher,
  then the account switcher step fails as `NO_SWITCHER`.
- Given a row labelled "Paperclip · Acme Click Test" alone,
  then the connection row step fails as `NO_USER_NAME`.
- Given a restarted Halonic whose demo shows its connection as Signed out with Sign in again,
  then the restart step fails as `SIGN_IN_AGAIN_SHOWN`.
- Given a restarted Halonic whose Messenger says No connections,
  then the restart step fails as `NO_CONNECTIONS`.
- Given a Connect dialog that starts a sign-in at `http://paperclip.acme.test`,
  then the https step fails as `NOT_REFUSED`.
- Given a second sign-in the test Paperclip approved but that Settings › Connections never lists,
  then the add-account step fails as `NO_SECOND_ACCOUNT`.
