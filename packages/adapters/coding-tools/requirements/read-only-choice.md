# coding-tools.read-only-choice

- Status: active
- Since: unreleased
- Source: HAL-16854 (Liam's conditions on HAL-16748: Codex gets only the reading tools until it is confirmed to ask before using them)

The coding tool set shall offer `run_tests` too when its choice is `all`, and only the tools marked as only reading when its choice is `read-only`; a call to `run_tests` then gets the error result for a tool it doesn't offer. The server shall serve the `read-only` choice when started with `--read-only`, and `all` otherwise. It shall take `--max-test-seconds <n>`, a whole number of at least 10, as the longest a test run may take, and refuse any other value.

## Examples

- Given a server started with `--read-only`,
  when the client lists the tools,
  then it gets `read_ranges`, `search` and `repo_map`, without `run_tests`.
- Given a server started without it,
  when the client lists the tools,
  then `run_tests` is among them and isn't named as only reading.
