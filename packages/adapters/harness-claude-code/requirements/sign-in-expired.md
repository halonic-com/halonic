# harness-claude-code.sign-in-expired

- Status: active
- Since: 0.1.0
- Source: HAL-2552; fact check on HAL-2387 (rows 9 and 10); harness states H7 and H7s on HAL-2350

The Claude Code harness shall recognise the sign-in messages Claude Code prints when a model request fails, "Login expired", "Not logged in" and "Authentication required", as a hint, and turn them into a `SignInError` that says in plain words to sign in again, so the run ends before its first event and the engine reports it as `harness-start-failed` (H7). A line it doesn't recognise shall not count as a sign-in problem. In text that may be the agent's own answer, only the whole message shall count: one line that ends with the hint to run `/login`.

## Examples

- Given Claude Code prints "Login expired · Please run /login",
  when the line is read,
  then the problem is `sign-in-expired`, and its error says to sign in again with `claude auth login`.
- Given Claude Code prints "Not logged in · Please run /login",
  when the line is read,
  then the problem is `signed-out`.
- Given a line that only mentions a login,
  when it is read,
  then there is no sign-in problem.
