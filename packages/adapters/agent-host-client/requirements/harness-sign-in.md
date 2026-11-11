# agent-host-client.harness-sign-in

- Status: active
- Since: 0.1.0
- Source: board answer on HAL-5355 (option 1, a "Sign in for this agent" button in Studio); task HAL-5395; `apps/agent-host/README.md`, "Signing an agent in"

The harness stand-in shall offer `openSignIn` with one agent's settings folder, and ask the host's `POST /v1/harnesses/sign-in` to open a terminal the person can see, running the program's own sign-in pointed at that folder. When no window opened, it shall answer the host's reason and the command to run by hand. It shall fail with the host's kind when the harness has no sign-in of its own (`no_sign_in`) or the host refuses the command (`sign_in_refused`).

## Examples

- Given a host whose terminal opened,
  when Studio signs the agent `writer` in to Claude Code,
  then the host gets `{ harness: "claude-code", settingsFolder }` and the answer is `{ opened: true }`.
- Given a host that found no terminal,
  when Studio signs an agent in,
  then the answer holds the command to run by hand.
- Given a harness without a sign-in of its own,
  when Studio signs an agent in,
  then `openSignIn` fails with the kind `no_sign_in`.
