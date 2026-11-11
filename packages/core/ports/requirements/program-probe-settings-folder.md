# ports.program-probe-settings-folder

- Status: active
- Since: 0.1.0
- Source: review follow-up on HAL-5216, approach agreed on HAL-5231

The `ProgramProbe` port shall let a harness ask a program about one settings folder: the question names the environment variable that points the program at the folder, and the folder. A probe shall set only that variable on top of what it always passes, and shall answer `failed` for a variable it doesn't know, so the question can't pass anything else to the program.

## Examples

- Given a question about the folder of the agent "writer" with `CODEX_HOME`,
  when Codex is asked `login status`,
  then it runs with `CODEX_HOME` set to that folder.
- Given a question that names a variable the probe doesn't list,
  when the program is asked,
  then the answer is `failed` and the program isn't started.
