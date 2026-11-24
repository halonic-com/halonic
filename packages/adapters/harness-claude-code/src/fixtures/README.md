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

## Starting-context recordings

`starting-context/claude-code-<version>.json` holds the sizes of a pinned
Claude Code version's first model call, for each `ENABLE_TOOL_SEARCH` value
the harness sets: the characters of `system`, of `messages` and of each tool
definition, with the tool's name. Never the prompt's text.
`starting-context.test.ts` fails when the call with the setting for Claude's
own models goes over the target (requirement
`harness-claude-code.starting-context`). It also fails when the
`claude_code_version` the CLI platform probe installs
(`.github/workflows/cli-platform-probe.yml`) has no recording: record that
version when you change the probe's default.

To record a new version, point `ANTHROPIC_BASE_URL` at a local server that
saves each `/v1/messages` body and answers with a short `end_turn` message,
set a made-up `ANTHROPIC_API_KEY`, an empty `CLAUDE_CONFIG_DIR` and
`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, run `claude -p "hi"` once per
`ENABLE_TOOL_SEARCH` value, and write down the sizes of the first body.
