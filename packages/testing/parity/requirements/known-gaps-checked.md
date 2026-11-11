# parity.known-gaps-checked

- Status: active
- Since: 0.1.0
- Source: HAL-1541; the CLI calls from HAL-5228

The parity package shall keep every place where the new engine or CLI is still wrong about the old run logs or CLI calls in one file, `known-gaps.json`, each entry with an id, the task that fixes it, what it is about, what the old repo did, what the new repo does, and the base's workflow tests it shows in, as `<hub>/<workflow>/<name>`, or its CLI calls, by their name in `cli-calls.ts`, or both. A known gap is not an allowed difference: it excuses its tests and calls only until its task fixes them.

If an entry is malformed, names no task, lists neither a test nor a call, lists an empty list or a call `cli-calls.ts` doesn't have, has an unknown field or repeats an id, then the parity package shall refuse to read the file and name the entry.

## Examples

- Given a gap whose task is "soon", when the file is read, then reading fails.
- Given a gap with an empty list of tests, when the file is read, then reading fails.
- Given a gap that names the test "approve" without its hub and workflow, when the file is read, then reading fails.
- Given a gap that names only the call "run an agent with the echo model", when the file is read, then it is read as it is.
- Given a gap that names neither tests nor calls, or the call "run echo", when the file is read, then reading fails.
- Given two gaps with the same id, when the file is read, then reading fails and names the second.
