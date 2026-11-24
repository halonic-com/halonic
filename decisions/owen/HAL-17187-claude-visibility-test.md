# Decision: the Linux sandbox fence job installs Claude Code at one pinned version

- Approval: the board approved Claude Code for CI only, pinned and in this one job (HAL-17188); Liam approves this note in review
- Kind: internal

## What changes

- `ci.yml`'s bubblewrap (Linux) `sandbox-fence` job installs `@anthropic-ai/claude-code` globally at one exact version (`CLAUDE_CODE_VERSION`) before the CLI's fence tests, and fails if `claude --version` doesn't print that version.
- No other job installs it, it never becomes a `package.json` dependency, and the step gets no secret.

## Why

The coding tools test has to start a real `claude` the way `harness-claude-code` starts it, to show that the model sees the `mcp__halonic-tools__` tools without `defer_loading`. A stand-in program can't show what Claude Code itself sends. A version bump goes by pull request, like the srt pin.

## Tests

`apps/cli/fence/claude-code-coding-tools.starts.test.ts`, in the Linux fence job. It skips only where `claude` isn't installed: the other fence jobs don't install it, so the Linux job is the one that proves it. It shows requirement `harness-claude-code.mcp-tools-listed` in the real program; a fence test's results don't reach the requirement check, so it names no requirement of its own.

## Covers

- .github/
- apps/cli/fence/claude-code-coding-tools.starts.test.ts
