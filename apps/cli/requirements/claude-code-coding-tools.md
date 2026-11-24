# cli.claude-code-coding-tools

- Status: active
- Since: unreleased
- Source: HAL-17187

When the CLI's local engine runs an agent in Claude Code inside its fence, Claude Code shall list the tools of Halonic's coding tools server (`halonic-tools`) directly in its first model request, with none of them held back for its tool search.

## Examples

- Given a fenced run of an agent in the real Claude Code,
  when Claude Code sends its first Messages request,
  then its `tools` hold `mcp__halonic-tools__read_ranges`, `mcp__halonic-tools__search`, `mcp__halonic-tools__repo_map` and `mcp__halonic-tools__run_tests`, and none of those has `defer_loading`.
