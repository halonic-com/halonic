# engine.harness-bridge-session

- Status: active
- Since: unreleased
- Source: HAL-14992, Owen's plan approved with changes by Liam (the fence state comes from the session's actual sandbox result)

When the engine has opened a harness call's sandbox session, and before it starts the harness's program, it shall give the session to the call's bridge through the bridge's `sessionOpened`, when the host's bridge has one, for an agent in the sandbox and on this computer alike. If `sessionOpened` throws, then the call shall fail with that error, the program shall not start, and the session and the bridge shall be closed.

## Examples

- Given a bridge with `sessionOpened`,
  when a harness call runs,
  then the bridge hears the session, with its working folder, after the sandbox opened and before the program started.
- Given an agent a person placed on this computer,
  when its harness call runs,
  then the bridge hears the launcher's session.
- Given a bridge whose `sessionOpened` throws,
  when a harness call runs,
  then the call fails with that error, the program doesn't start, and nothing stays open.
