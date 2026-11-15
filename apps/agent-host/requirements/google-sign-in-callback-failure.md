# agent-host.google-sign-in-callback-failure

- Status: active
- Since: 0.1.0
- Source: HAL-10263 (follow-up of HAL-10258); builds on `agent-host.google-sign-in-callback`

When finishing the sign-in fails on the callback, the agent host shall answer 502 with a fixed HTML page, not JSON, because a browser tab shows it. The page shall hold no text of the error, no `state` and no code, and the detail shall go to the host's log only.

## Examples

- Given a callback whose sign-in can't be finished, when the browser opens it, then the answer is 502 `text/html`, the page names neither the error nor the `state`, and the log has the detail.
