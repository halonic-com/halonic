# harness-claude-code.start

- Status: active
- Since: 0.1.0
- Source: HAL-194 build plan C3; HAL-3586; `Harness` port v2

The Claude Code harness shall start a run by writing the agent's settings folder and then starting its command in the run's sandbox session, and send the task's prompt as the first user message. The run's events shall be what the `stream-json` reader makes of Claude Code's output; after the result, the harness shall end Claude Code's input and wait until it has exited before the stream ends. `send` shall pass a person's answer on as the next user message, and refuse an approval decision, because Claude Code asks for approvals through the bridge. When Claude Code ends before its result, the run shall end with an error that says how it ended, with the last line of its standard error but never the bridge token, or with a `SignInError` when that output is a sign-in message. If the profile has no settings folder, then the run shall end with an error and start nothing.

## Examples

- Given a run of an agent whose prompt is "Name a colour of the sea.",
  when it starts,
  then the settings folder has been written, and Claude Code reads the prompt as its first user message.
- Given a run waiting on Claude Code,
  when a person's answer is sent,
  then Claude Code reads it as the next user message.
- Given Claude Code prints "Not logged in · Please run /login" on standard error and exits with 1,
  when the run ends,
  then it ends with a `SignInError` for `signed-out`.
- Given Claude Code exits with 1 after printing the bridge token on standard error,
  when the run ends,
  then the error says it stopped with exit code 1 and doesn't contain the token.
