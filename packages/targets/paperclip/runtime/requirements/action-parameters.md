# runtime.action-parameters

- Status: active
- Since: unreleased
- Source: HAL-18194 (follow-up from HAL-18192: a tool file's parameters must match what its action reads)

The runtime's handlers shall each read from an agent's call exactly the parameters their action declares in `@halonicjs/format` (`toolActionInfo(name).parameters`), and no other; and when a call leaves out a parameter the action declares as required, the handler shall answer with an error before it sends any request to GitHub, Paperclip or the plugin's state.

## Examples

- Given the `github.pull-request` handler,
  when it is called with `pr` and `repo`,
  then the names it reads are `pr` and `repo`, as the format declares them.
- Given the `paperclip.task` handler,
  when it is called without `task`,
  then it answers with an error and reads no task.
