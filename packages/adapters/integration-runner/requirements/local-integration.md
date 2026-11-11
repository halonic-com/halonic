# integration-runner.local-integration

- Status: active
- Since: 0.1.0
- Source: HAL-983 (design HAL-958 sections 3.5 and 5, attack cases A12 and A32)

When Halonic loads a local integration, it shall check the permission sheet and the workspace's choices without loading the integration's code, refuse the folder when a symbolic link in it leads out of it or nowhere, and only then start one runner through the caller's start (the trust check, then the start gate). It shall offer the integration's tools only when what the runner declares matches the sheet, and stop the runner otherwise. After an idle stop, the next call shall check the folder's links again, start a new runner the same way and refuse to go on when its code declares something else; after any other stop or a refused restart, no runner shall start again and every later call shall fail with that reason.

## Examples

- Given a local integration whose sheet declares `tokens`,
  when it is loaded,
  then it is refused with `tokens-not-allowed` and no runner starts.
- Given a folder with a link to a folder outside it,
  when the integration is loaded,
  then it is refused with `link-out-of-folder` and no runner starts.
- Given a runner whose code declares a tool with a different risk than the sheet,
  when the integration is loaded,
  then it is refused with `tool-differs` and the runner is stopped.
- Given a runner that stopped because it broke the protocol,
  when the next call comes,
  then the call fails with that reason and no new runner starts.
- Given a runner that stopped for being idle and a link out of the folder added since,
  when the next call comes,
  then the call fails with `link-out-of-folder`'s reason and no new runner starts.
- Given a call that got a runner just as it stopped for being idle,
  when that runner refuses the call,
  then the call is made once more on a new runner.
