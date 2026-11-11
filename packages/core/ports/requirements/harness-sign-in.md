# ports.harness-sign-in

- Status: active
- Since: 0.1.0
- Source: board answer on HAL-5355 (option 1, a "Sign in for this agent" button in Studio); task HAL-5395

The `Harness` port shall let a harness name its program's own sign-in through the optional `signIn`: the program, the arguments that sign in, and the environment variable that points the program at one agent's settings folder. Studio shall be able to run it for one agent, and `halonic doctor` to show it, without knowing the program. A harness without a sign-in of its own shall leave it out.

## Examples

- Given the Claude Code harness,
  when its `signIn` is read,
  then it names `claude` with `auth login` and the variable `CLAUDE_CONFIG_DIR`.
- Given the built-in loop,
  when its `signIn` is read,
  then there is none.
