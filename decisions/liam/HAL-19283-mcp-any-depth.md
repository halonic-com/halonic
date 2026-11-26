# Decision: `.mcp.json` and `.claude` leave routine review at any depth

- Task: HAL-19283
- Approval: Julian's item 7 on HAL-19247 and his review of #6571; the board asked for it on HAL-19283. Julian signs, since Liam wrote the pull request
- Kind: internal

## What changes

The active requirement `paperclip.routine-review` now names `.mcp.json`, a `.claude` entry and
anything in a `.claude` folder **in any folder** among the paths the routine reviewer never
approves alone, with an example (`apps/cli/.mcp.json`, `apps/cli/.claude/settings.json`, a link
`apps/cli/.claude`). Before, only the root copies were excluded, so `apps/cli/.mcp.json` counted as
routine.

`routineExcludedNames` in `reviewer-paths-routine.ts` matches the entry `.claude` itself (a link
to a routine folder would otherwise pass) and any path below it, line breaks in the name
included. `docs/guides/review.md` and the root `AGENTS.md` name the same rule.

## Why

These files configure the agents themselves (tools, permissions, MCP servers), wherever they sit.
Julian's scope list keeps agent config with Liam and Julian. The live Merger uses
`routineRefusal()` from `main`, so once this merges it no longer needs its own extra path list.
No rule is relaxed: every change takes paths out of routine review.

## Tests

No test was skipped, weakened or deleted. `routine-review.test.ts` gains five rows that refuse
the routine role (`apps/cli/.mcp.json`, `apps/cli/.claude/settings.json`,
`packages/studio/shell/.claude/commands/review.md`, `apps/cli/.claude` and a `.claude/` path with
a line break) and two near-miss rows that stay routine.

## Covers

- paperclip.routine-review
