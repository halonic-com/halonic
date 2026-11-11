# integration-runner.start

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958, sections 1 b, 2 and 5, attack cases A17, A23, A38)

When Halonic starts a runner, it shall open a `Sandbox` session of its own with the untrusted profile (no network and no loopback bridge, writes only to a fresh temp folder, the home folder and the socket folders hidden except the way to Node, the runner and the integration, and an environment holding only `TMPDIR`), start Node in it with its permission model reading only the runner and the integration's folder, pass a fresh nonce, report the session's fence proof and every access the fence refused, and close the session when the runner stops for any reason.

Halonic shall refuse to start a runner, before it opens a session, when Node's folder, the runner, the integration's folder or the temp folder is or holds the home folder or a socket folder, or when a folder on the way to one of them can't be listed.

A profile can't allow a path inside a denied one, so when the home folder or a socket folder holds what the runner needs, its other entries are hidden one by one, as they are when the session opens. A file added to that folder later is not hidden. That is accepted: the session is short-lived, and Node's permission model reads only the runner and the integration's folder (Liam's review, HAL-4621).

## Examples

- Given an integration folder inside the home folder,
  when the profile is built,
  then every other entry on the way from the home folder is hidden, and the integration's folder is read-only, not hidden.
- Given two runner starts,
  when each says `ready`,
  then each start had its own nonce.
- Given a session whose fence proof is `not-fenced`,
  when Halonic starts the runner,
  then the start fails, the session is closed and no runner is connected.
- Given a started runner,
  when it ends by itself,
  then its session is closed.
- Given the fence refuses a file read during a run,
  then the block is reported as a `fence` block.
- Given an entry file outside the integration's folder,
  when Halonic starts the runner,
  then no session is opened.
- Given an integration folder that is the home folder, or a Node folder of `/`,
  when Halonic starts the runner,
  then no session is opened.
- Given a folder on the way to the integration that can't be listed,
  when the profile is built,
  then the start fails instead of hiding nothing in it.
