# cli.commands.tools.review

- Status: active
- Since: 0.1.0
- Source: HAL-2827 (HAL-850 step 5, the board's A1, B1, C2 and D1); the words of cli-output 3.10 (revisions 33 and 36) and the UX checklist on HAL-2883, parts B and C; HAL-2579 F9 and G1

The `halonic tools review <source>` command shall connect the workspace's connector `<source>`, only in a workspace trusted as it is now, and show its listed tools as Studio's review screen does: a title and the two-line top line, then each tool waiting for approval, Changed before Not approved, each in listing order; then the tools Halonic refused, with why; then the tools their server keeps changing, each with the command that approves its version on purpose, with the fingerprint in full. Each tool shall be shown as its block (cli.commands.tools.blocks). In a terminal it shall ask about each waiting tool under its block and approve exactly the fingerprint shown, then end on how many it approved, which stay off and how many are on. Ctrl C during a question shall keep the tools already approved and say which. Where nobody can answer (no terminal, `CI`, `--json`) it shall show the same blocks, ask nothing, end on stderr with how many stay off and the `approve … --fingerprint` command, and exit 1. With `--json` it shall give the source, the tools on, the waiting tools with state, fingerprint, `keepsChanging`, `serverChanged` and changes, and the refused tools. It shall fail as `approve` does when the workspace isn't trusted, the listing is refused or an approval can't be read (cli.commands.tools.approve).

## Examples

- Given Acme's `notes-mcp` listing `send` (approved), `lookup` (changed), `archive` (new), `look.up` (refused) and `search` (changing on every listing),
  when `halonic tools review notes-mcp` runs without a terminal,
  then it shows lookup as Changed, archive as Not approved, look.up as refused and search as Keeps changing, asks nothing, says on stderr that 2 tools stay off and exits 1.
- Given the same, in a terminal,
  when the person answers n for lookup and y for archive,
  then archive is approved at the fingerprint shown and the last line is "✓ Approved 1 tool from notes-mcp. 1 stays off: lookup. 2 tools are on.".
- Given the person answered y for lookup,
  when they press Ctrl C at the next question,
  then lookup stays approved, stderr says "Stopped. Approved 1 tool from notes-mcp before that: lookup." and it exits 130.
- Given `send` approved, and the connector's arguments changed since,
  when the source is reviewed,
  then send is Changed with the line "Its text hasn't changed, but notes-mcp connects differently…" and no before or now.
- Given a description with an escape code, a carriage return and U+202E,
  when the source is reviewed,
  then none of them reaches the terminal raw.
