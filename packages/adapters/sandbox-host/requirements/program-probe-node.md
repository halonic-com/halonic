# sandbox-host.program-probe-node

- Status: active
- Since: 0.1.0
- Source: HAL-193 (plan phase 3); implements `ports.program-probe`, as agreed on HAL-2094

The sandbox-host adapter shall provide the `ProgramProbe` port with Node: it finds a bare program name on the launcher's PATH list and starts the absolute path it found with no shell, gives it only PATH, HOME and the locale variables, ends it after about 5 seconds with a `failed` answer in one plain sentence, cuts its stdout and stderr at about 4 KB each, treats a name with a path separator as `missing`, and never throws.

## Examples

- Given a name with a path separator, such as `./claude`,
  when it is asked something,
  then the answer is `{ status: "missing" }` and nothing is started.
- Given a program that prints a token variable of the launcher's environment,
  when it is asked something,
  then the variable is not set for it, while PATH is.
- Given a program that doesn't end within the limit,
  when it is asked something,
  then it is killed and the answer is `failed` with one plain sentence.
- Given a program that prints more than 4 KB,
  when it is asked something,
  then the output is cut at 4 KB.
