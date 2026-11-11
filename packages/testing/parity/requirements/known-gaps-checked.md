# parity.known-gaps-checked

- Status: active
- Since: 0.1.0
- Source: HAL-1541

The parity package shall keep every place where the new engine is still wrong about the old run logs in one file, `known-gaps.json`, each entry with an id, the task that fixes it, what it is about, what the old repo did, what the new repo does, and the base's workflow tests it shows in, as `<hub>/<workflow>/<name>`. A known gap is not an allowed difference: it excuses its tests only until its task fixes them.

If an entry is malformed, names no task, lists no test, has an unknown field or repeats an id, then the parity package shall refuse to read the file and name the entry.

## Examples

- Given a gap whose task is "soon", when the file is read, then reading fails.
- Given a gap with an empty list of tests, when the file is read, then reading fails.
- Given a gap that names the test "approve" without its hub and workflow, when the file is read, then reading fails.
- Given two gaps with the same id, when the file is read, then reading fails and names the second.
