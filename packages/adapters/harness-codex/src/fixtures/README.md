# Codex output for the tests

What `codex app-server` printed in five sessions of Codex 0.166.0, one JSON
message per line, recorded on 10 Nov 2026 against a local fake of the
OpenAI Responses API, so no real model, key or person was involved. The run
token is the made-up one the tests use. Folders, the host name, the
installation id and process ids are replaced with made-up ones.

- `codex-0.166.0-tools.jsonl`: a turn that runs `ls notes`, a `cat` that
  fails, `env` printing the run token, and an `apply_patch` that adds a file,
  then answers.
- `codex-0.166.0-mcp.jsonl`: a turn that calls a tool on the MCP server
  `notes` and one on `halonic` (the bridge's name), which fails, then answers.
- `codex-0.166.0-subagents.jsonl`: a turn that spawns two subagents, each
  runs one command and answers; the agent waits for each, closes them and
  answers.
- `codex-0.166.0-followup.jsonl`: a turn that spawns one subagent, waits for
  it, sends it a second task with `send_input`, waits again, closes it and
  answers.
- `codex-0.166.0-failed.jsonl`: a turn the provider refuses with HTTP 401;
  Codex retries five times, then the turn fails.

When you add messages from a real run, replace every id, path, address, name
and token with a made-up one first, and check the file with `pnpm check`
before you commit it.
