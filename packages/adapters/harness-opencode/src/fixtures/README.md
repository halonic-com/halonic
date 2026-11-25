# OpenCode output for the tests

Recorded from the real OpenCode 2.3.0 Linux binary, run as
`opencode run --standalone --auto --archived --format json --title writer`
with the adapter's config and environment, against a local server that
answers like Anthropic's Messages API with scripted replies. They hold no
real token, session or person: the run's folder is replaced by `/acme`, and
the model is the made-up `acme-model`.

- `opencode-2.3.0-ok.jsonl`: a run that finishes. A `read` call, a `shell`
  call that exits with code 3, and the final answer.
- `opencode-2.3.0-fail.jsonl`: a run the bridge refuses, which ends with an
  `error` line.
- `opencode-2.3.0-tools.json`: the names of the tools in each model request
  of that run, in the order OpenCode sent them.

After the runs, the made-up run token was in no file of the settings folder
(`opencode.db`, the log, the data and state folders). The check that runs
the binary in CI is the egress test (`fence/opencode-egress.test.ts`).

Record a new version the same way, and replace every id, path, address,
name and token with a made-up one before you commit it.
