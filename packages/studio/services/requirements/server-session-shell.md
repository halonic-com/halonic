# services.server-session-shell

- Status: draft
- Since: unreleased
- Source: HAL-18256; plan on HAL-17834, sections 1 and 4

When the Studio runs in the desktop shell on macOS or Linux, a workspace's services shall have the opener "Run with Claude" calls, which calls the shell's `server_session_open` with exactly the task, the brief and the request hash, and never who asked, a host, a user, a command or a path. The opener shall pass on each answer the shell knows, and shall turn any other answer into a refusal that says "the desktop app gave an answer this Studio doesn't know". Where the Studio runs in a browser or on Windows, the services shall have no opener, so "Run with Claude" shows the manual guide.

## Examples

- Given the desktop app on Linux and an offer for task `HAL-1234` from Chief at revision `rev-2`,
  when the user starts it,
  then the shell receives `server_session_open` with only `task`, `brief` and `requestHash`.
- Given the desktop app on Windows,
  when a workspace opens,
  then its services have no opener.
- Given a shell that answers `{ "kind": "exploded" }`,
  when the opener is called,
  then it answers a refusal that says "the desktop app gave an answer this Studio doesn't know".
