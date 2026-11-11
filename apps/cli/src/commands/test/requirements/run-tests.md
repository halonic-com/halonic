# cli.commands.test.run-tests

- Status: active
- Since: 0.1.0
- Source: HAL-187 item 6 and HAL-4215; the CLI output design on HAL-1981 (cli-output 3.3, the sentences settled on HAL-2690); the options, exit codes and `--json` fields from the CLI reference on HAL-1986; the sentences for the runner's other failures decided by the team on HAL-4215

The `halonic test` command shall run the workflow tests of the workspace in the current folder, or in `--dir <folder>`, through the test runner, with the test model (the case's scripted replies, then empty ones) and empty in-memory stores, so it reaches no provider, starts no program, writes nothing and never asks for trust. It shall print "Testing <workspace> with the test model. Nothing is sent anywhere.", then one line per test in the order they ran: ✓ or ✕, the workflow and the test's name ("support-reply › answers a refund question") and its time to a tenth of a second, lined up in columns. Under a failed test it shall print one sentence per failure, in the runner's order, naming steps as the live lines do and a step id that isn't one of the workflow's in quotes, then the test file and the line of the case's `name`. It shall end with "✓ N tests passed in T s." when every test passed and exit with 0, and otherwise with "✕ P passed, F failed. N tests in T s." and exit with 1.

`--filter <text>` shall keep only the tests whose `hub/workflow/name` contains the text; when it keeps none, the command shall stop with "No tests match "<text>"." and the fix to run `halonic test --list`, with the user's `--dir`, and exit with 2. A workspace without tests shall get "! <workspace> has no workflow tests yet." and "Add one next to a workflow as <workflow>.test.yaml." and exit with 0. `--list` shall list the tests the filter keeps, each with its file and line, and how many, without running them. A folder without `workspace.yaml` shall stop with the no-workspace error, exit 4. With `--json`, it shall give `passed`, `failed` and `cases`, each with its hub, workflow, name, `status` (`passed` or `failed`), `durationMs` and `failures`, each failure with its sentence as `message`, the test file with `/` and the line; with `--list`, each case's hub, workflow and name only.

## Examples

- Given the acme example, whose five tests pass,
  when `halonic test` runs in it,
  then it prints a ✓ line for each of the five tests and "✓ 5 tests passed in 0.0 s." and exits with 0.
- Given a test that expects the spam mail to end in `replied`,
  when `halonic test` runs,
  then it prints "✕ support-reply › Spam gets a reply", "Expected the run to end in the step Finished with the reply approved, but it ended in Finished without a reply, because nobody needs to answer spam." and the file and line under it, and exits with 1.
- Given `--filter Alex`,
  when `halonic test` runs in the acme example,
  then only "support-reply › Alex's threat is rejected and gets no reply" runs; given `--filter refnd`, it prints "✕ No tests match "refnd"." and "Run halonic test --list to see them all." and exits with 2.
- Given a workspace without test files,
  when `halonic test` runs,
  then it prints "! acme has no workflow tests yet." and exits with 0.
