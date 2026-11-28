# connections.paperclip-sign-in-needed

- Status: active
- Since: unreleased
- Source: HAL-20516; board decision HAL-10 (27 Nov: Paperclip's sign-in blocks Messenger and Inbox); plan approved on HAL-20519

The connections feature shall add the Paperclip sign-in through `signIns.add` (`shell.sign-in-needed`), blocking the Inbox and the Messenger. A sign-in shall be needed for each Paperclip connection whose state is `signed-out`, named by the connection's label. Where the engine serves no connections, none shall be needed. If the connection list can't be read, the sign-in shall report it as unreadable.

**Sign in** shall sign that connection in again at its own address and give the challenge's phrase and approval page. A sign-in that connects shall end signed in; one that expires, is cancelled, is refused or whose key wasn't saved shall end failed. If Paperclip refuses to start the sign-in, starting shall fail with the reason.

## Examples

- Given the connections "Paperclip · Acme team" (signed out) and "Paperclip · Zeta" (online),
  then one sign-in is needed, "Paperclip · Acme team".
- Given a sign-in for "Paperclip · Acme team",
  when it is approved,
  then it ends signed in and the connection is online again.
