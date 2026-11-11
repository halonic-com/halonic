# integration-runner.start

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958, sections 1 b, 2 and 5, attack cases A17, A23, A36, A38)

When Halonic starts a runner, it shall open a `Sandbox` session of its own with the untrusted profile (no network and no loopback bridge, writes only to a fresh temp folder, the home folder and the socket folders denied as a whole with only Node's folder, the runner, the integration's folder and the temp folder reopened in them (on Windows, their other entries denied by name), an environment holding only `TMPDIR`, and the OS key store denied), start Node in it with its permission model reading only the runner and the integration's folder, pass a fresh nonce, report the session's fence proof and every access the fence refused, and close the session when the runner stops for any reason.

Halonic shall refuse to start a runner, before it opens a session, when Node's folder, the runner, the integration's folder or the temp folder is or holds the home folder or a socket folder, or, on Windows, when a folder on the way to one of them can't be listed.

The profile denies the home folder and each socket folder as a whole and reopens the paths the runner needs inside them, so a file or folder added there after the profile is built is denied too (HAL-5808). On Windows a deny on a folder also takes the right to look at the folders on the way to a path inside it, so Node couldn't resolve the runner's path in a reopened folder (HAL-5644). So on Windows the profile denies the other entries of those folders by name, as they are when the session opens, and reopens nothing; what is made in the home folder later is kept out by its own access list, except a folder another sandboxed session makes and writes, which stays readable (threat model 4.6, Known limits).

Halonic shall resolve every path the runner needs, the home folder and the socket folders to their real places before it builds the profile, because the fence denies a path's real place too. A symlink denied by name whose real place is, holds or is inside a path the runner needs is left as it is; whatever it reaches outside those paths is hidden at its real place. A path the runner needs that can't be resolved, or an entry file whose real place is outside the integration's real folder, fails the start before a session is opened (HAL-4633).

## Examples

- Given an integration folder inside the home folder,
  when the profile is built,
  then the home folder is denied as a whole, and the integration's folder is reopened and read-only.
- Given a folder made in the home folder after the profile is built,
  when the runner reads it,
  then the profile denies it.
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
- Given Node's folder reached through a symlink in the home folder, such as `~/.nvm/current`,
  when the profile is built,
  then Node's real folder is reopened and read-only, and on Windows the symlink is not denied by name and nothing is reopened.
- Given an entry file that is a symlink out of the integration's folder,
  when Halonic starts the runner,
  then no session is opened.
- Given a folder on the way to the integration that can't be listed, on Windows,
  when the profile is built,
  then the start fails instead of hiding nothing in it.
