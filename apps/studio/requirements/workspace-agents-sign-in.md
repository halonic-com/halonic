# studio.workspace-agents-sign-in

- Status: draft
- Since: unreleased
- Source: HAL-6351 (board option 1 on HAL-5355, "Sign in for this agent"); HAL-5395; HAL-6169

The app's agents host shall check whether Claude Code or Codex can run for an agent in that agent's own settings folder, which it asks the agent host for, so an agent that isn't signed in there reads as not signed in. It shall open a harness's own sign-in for an agent by asking the agent host for that agent's settings folder and then to open the sign-in there, and answer whether a terminal opened or the command to run by hand. Where there is no agent host it shall refuse with the reason, and for an agent that isn't there with `not_found`; when the agent host can't give the folder, it shall open nothing and reject with the host's kind.

## Examples

- Given the agent `writer`, when Studio checks Claude Code for it, then the agent host is asked for `writer`'s settings folder and detects Claude Code in it.
- Given the agent `writer`, when Studio opens its sign-in to Claude Code, then the agent host opens it in `writer`'s settings folder.
- Given an agent host that doesn't serve the workspace, when Studio opens a sign-in, then nothing opens and the answer is `unknown_workspace`.
- Given no agent host, when Studio opens a sign-in, then it refuses with "Halonic can't open a terminal on this computer from here."
