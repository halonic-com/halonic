# Decision: Claude Code's tool search goes on for Claude's own models

- Approval: Paperclip task HAL-17253 (token-saving direction on HAL-16892, phase 1, the board's yes on HAL-16897)
- Kind: internal

The requirement `harness-claude-code.mcp-tools-listed` said tool search is
off for every model (HAL-16737), so a cheaper model that never searches
still sees the bridge's tools. Phase 1 of the token-saving direction asks
for a small starting context. With tool search off, Claude Code 2.1.325's
first call is about 21,300 tokens before any bridge tool; with it on, about
13,300, because the MCP tools and the rarely used built-in tools load on
demand.

So the requirement now turns tool search on for Claude's own models and
keeps it off when the task's model is for every call (`modelForEveryCall`),
which is the compatible-provider case HAL-16737 was about. The test that
said "off for every model" changes with it; no test is skipped or removed.
The variable still adds no tool and no permission.

## Covers

- harness-claude-code.mcp-tools-listed
- packages/adapters/harness-claude-code/src/environment.test.ts
