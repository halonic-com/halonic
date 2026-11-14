# cli.commands.google.sign-in

- Status: active
- Since: 0.1.0
- Source: HAL-717 (D1); Google setup flow design 4.1 and 3.5, plan D6; `google-sign-in.sign-in`

The `halonic google sign-in <account> --connection <id>` command shall sign the setup record `<account>` in on this computer. The connection is a Google connector of the workspace in `--dir` (the current folder without it); its address is the one that must sign in, and the services are the integrations of that workspace whose sheets list `googleScopes`. It shall listen on `127.0.0.1` on a free port at the path `/google/callback`, print the address of the sign-in page for the person to open in a browser on this computer (a later change lets it open the browser itself, and then it prints the address only when none opens), and wait up to 10 minutes for Google's answer. It shall refuse before opening anything, with a fix line, a missing account (exit 2 without `<account>` or `--connection`, 4 for an unknown ref or connection), a record without a client ID or client secret, a missing `token-key`, a connection that isn't a Google one, and a workspace with no integration that lists Google scopes. When Google confirms the connection's address it shall save the refresh token in the sealed token store, mark the record signed in, record each service's check and print "✓ Signed in." and one line per service. In every other end (cancelled, blocked, another account, a refused secret or code, no refresh token, Google not reachable, a timeout) it shall save no token, leave no sign-in marked as waiting and exit non-zero with a line that says only which of these happened. It shall never ask for a secret at the terminal. The client secret, the authorisation code, the tokens and the connection's address shall not appear in any line printed, in an error or in the profile's files except sealed.

## Examples

- Given a record with a client ID and a saved fake secret and a connection `mailbox`,
  when the browser comes back with a good code for the connection's address,
  then it prints "✓ Signed in." and "✓ gmail works.", and the sealed store holds the refresh token.
- Given another Google account signs in,
  then it exits 7, saves nothing and prints no address.
- Given no sign-in comes back in time,
  then it exits 9 and the record no longer says a sign-in is waiting.
