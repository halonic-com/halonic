# cli.json-lines

- Status: active
- Since: unreleased
- Source: HAL-4139 (agreed on HAL-4064 for HAL-4056: in 0.1 `halonic run --json` stays one document; settled by the CTO on HAL-4139); the CLI output design on HAL-1981 (cli-output 1.8), approved by the board on HAL-2123; the `--json` section of the CLI reference on HAL-1986

The `halonic run` command shall take `--follow` with `--json`, and then print JSON Lines instead of one document: one line for each event of the run, `{ "outputVersion": 1, "event": … }`, as the event happens, in the order of the run's log, each event once, also after an `--event` has moved the run on. The last line shall be the command's result, `{ "outputVersion": 1, "ok": true, "run": … }`, with the same `ok` (true when the command exits with 0) and `run` as the plain document, and also when the run failed or was stopped with Ctrl C, as the plain document has it, or, when the command fails, `{ "outputVersion": 1, "ok": false, "error": … }` with the same `error` as plain `--json` (`cli.json`). A failure before the run starts shall give only that last line. Each line shall be one JSON value with no line break inside it, with every loaded secret removed, as in plain `--json`. stdout shall hold only these lines and stderr shall stay empty except for `--debug` lines. The exit code shall be the same as without `--follow`. `--json` alone shall stay one document, `{ outputVersion, ok, run, events }`, as before. `--follow` without `--json` shall be a usage error (exit 2).

## Examples

- Given the Acme example and `halonic run support-reply --json --follow`,
  when the run finishes,
  then stdout is one line for each event, oldest first, each `{ "outputVersion": 1, "event": … }`, then one last line `{ "outputVersion": 1, "ok": true, "run": … }`, and the exit code is 0.
- Given a run whose step fails and `--json --follow`,
  when the run ends,
  then the last line is the run with status `failed`, with `ok` false as plain `--json` has it, and the exit code is 1.
- Given `halonic run no-such-workflow --json --follow`,
  when it is run,
  then stdout is one line `{ "outputVersion": 1, "ok": false, "error": … }` with kind `not_found`, stderr is empty and the exit code is 4.
- Given `halonic run support-reply --json` without `--follow`,
  when the run finishes,
  then stdout is one document with `outputVersion`, `ok`, `run` and `events`, as in 0.1.0.
- Given `halonic run support-reply --follow` without `--json`,
  when it is run,
  then it fails with kind `usage` and the exit code is 2, and nothing ran.
