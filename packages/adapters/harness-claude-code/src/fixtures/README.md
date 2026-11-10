# Claude Code output for the tests

`claude --output-format stream-json` lines, one JSON object per line, in the
shape Claude Code 2.1.311 and 2.1.321 print them. They hold no real token,
session or person: ids, paths, addresses and costs are made up, and fields the
reader doesn't use are shortened.

- `claude-code-2.1.321.jsonl`: a run that finishes. A tool call, a subagent
  with a tool call of its own, a call through the bridge, a line type the
  reader doesn't know, and the `result`.
- `claude-code-2.1.311.jsonl`: a run that fails. A tool call that fails, two
  subagents at once, one without a type, and an `error_max_turns` result.

When you add lines from a real run, replace every id, path, address, name and
token with a made-up one first, and check the file with `pnpm check` before you
commit it.
