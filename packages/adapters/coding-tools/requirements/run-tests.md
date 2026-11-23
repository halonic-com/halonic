# coding-tools.run-tests

- Status: active
- Since: unreleased
- Source: HAL-16854 (plan HAL-16737, sections 2 and 5; Liam's conditions on HAL-16748)

The `run_tests` tool shall run the `command` it is given, exactly as written, in the platform's shell in the working folder, and shall not be marked as only reading, so a harness never allows it without asking. Before anything starts, it shall refuse a command that names a file under a skill's `scripts/` folder. The command shall get no input and only the variables `programEnvironment` gives a harness program, plus `CI`, `NO_COLOR` and `FORCE_COLOR`, never the server's own environment. Its output, standard output and error together, shall go only to a new log file in the server's test log folder, cut at 8 MB, and never to the server's own output. It shall run one command at a time, refuse a second call while one runs, and stop the command and everything it started at its time limit (`timeoutSeconds`, 10 to 900, 300 by default, and never above `--max-test-seconds`) or when the call is cancelled; on macOS and Linux it shall also stop what the command left running once it exits. The answer shall give the exit code or why it was stopped, the command, the log file's path, the lines that say what failed or sum the run up (at most 16,000 characters), and the last 15 lines, with every value of the server's variables whose names say they hold a secret removed.

## Examples

- Given a server whose environment holds `HALONIC_RUN_TOKEN`,
  when the model runs a command that prints that variable,
  then the command sees no such variable, and the answer doesn't hold the token.
- Given a command that sleeps for a minute and `timeoutSeconds` 10,
  when the model runs it,
  then it is stopped after 10 seconds and the answer says so.
- Given the command `node skills/acme/scripts/run.js`,
  when the model runs it,
  then it is refused and nothing starts.
