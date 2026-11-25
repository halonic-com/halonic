# format.tool-action-parameters

- Status: active
- Since: unreleased
- Source: HAL-18194 (follow-up from HAL-18192: a tool with `number` instead of `pr` built and then failed every call)

The format shall declare, for each action in `TOOL_ACTIONS`, the parameters its code reads from an agent's call, each with its name and whether it is required, as data (`toolActionInfo(name).parameters`). When a tool file passes its schema, the format shall still refuse it:

- with `parameter-missing` at `parameters` for each required parameter of its action that the file doesn't declare, with a message that names the action and the parameter and says to add or rename it;
- with `parameter-not-read` at `parameters.<name>` for each parameter the file declares that its action doesn't read, with a message that names the action and the parameters it reads, and never repeats the file's own name for it.

## Examples

- Given a tool that runs `github.pull-request` and declares `number` instead of `pr`,
  when it is parsed,
  then it fails with `parameter-missing` at `parameters`, naming `github.pull-request` and `pr`, and with `parameter-not-read` at `parameters.number`.
- Given a tool that runs `paperclip.task` and declares only `task`,
  when it is parsed,
  then it passes: `comments` and `document` are optional.
- Given a tool that runs `github.open-pull-requests` and declares `repo`,
  when it is parsed,
  then it fails with `parameter-not-read` at `parameters.repo`, saying the action reads no parameters.
