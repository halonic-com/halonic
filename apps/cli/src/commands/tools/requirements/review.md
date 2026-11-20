# cli.commands.tools.review

- Status: active
- Since: unreleased
- Source: HAL-2827 (HAL-850 step 5, the board's A1, B1, C2 and D1); the words of cli-output 3.10 (revisions 33 and 36) and the UX checklist on HAL-2883, parts B and C; HAL-2579 F9 and G1; HAL-13288 (only the tools `tools.allow` offers)

The `halonic tools review <source>` command shall connect the workspace's connector `<source>`, only in a workspace trusted as it is now, and show its listed tools as Studio's review screen does: a title and the two-line top line, then each tool waiting for approval, Changed before Not approved, each in listing order; then the tools Halonic refused, with why; then the tools their server keeps changing, each with its fingerprint in full. Each tool shall be shown as its block (cli.commands.tools.blocks). A tool the connector's `tools.allow` leaves out is never offered to agents, so it shall be neither shown, nor asked about, nor counted as on, whether it waits, keeps changing, was refused or was approved; without `allow` every listed tool counts. In a terminal it shall ask about each waiting tool under its block and approve exactly the fingerprint shown, then end on how many it approved, which stay off and how many are on, after a line that names the tools their server keeps changing, which stay off. When nothing else waits, that line is the last one, so it never says nothing is waiting while one of them stays off. Ctrl C during a question shall keep the tools already approved and say which. Where nobody can answer (no terminal, `CI`, `--json`) it shall show the same blocks, ask nothing, end on stderr with how many stay off and the `approve … --fingerprint` command, and exit 1; with `--json` the document says `ok: false` and an `error` of kind `conflict` whose `message` is the "stay off" sentence and whose `fix` is that command. It shall exit 0 when nothing is waiting or when it asked about every waiting tool, whatever the answers, and 130 when Ctrl C ended a question. A tool its server keeps changing shall not be asked about: its block shall say so, because its fingerprint doesn't hold still, and that review asks about it again within a day of its server no longer changing it, with the `review` command. It shall not print an `approve --fingerprint` command for it, because `approve` lists the tools again and the server has another version by then. An approval shall be saved at the fingerprint that was shown above the question, never at one read again after the answer, so a tool whose server changed it meanwhile is waiting again at its new fingerprint. With `--json` it shall give the source, the tools on, the waiting tools with state, fingerprint, `keepsChanging`, `serverChanged` and changes, and the refused tools, and after Ctrl C the `approved` tools, with the names as the server wrote them like the waiting tools'. It shall fail as `approve` does when the workspace isn't trusted, the listing is refused or an approval can't be read (cli.commands.tools.approve).

## Examples

- Given Acme's `notes-mcp` listing `send` (approved), `lookup` (changed), `archive` (new), `look.up` (refused) and `search` (changing on every listing),
  when `halonic tools review notes-mcp` runs without a terminal,
  then it shows lookup as Changed, archive as Not approved, look.up as refused and search as Keeps changing with no `approve` command, asks nothing, says on stderr that 2 tools stay off and exits 1.
- Given the same, in a terminal,
  when the person answers n for lookup and y for archive,
  then archive is approved at the fingerprint shown and the last two lines are "! 1 tool from notes-mcp stays off because notes-mcp keeps changing it: search." and "✓ Approved 1 tool from notes-mcp. 1 stays off: lookup. 2 tools are on.".
- Given lookup and archive approved, and search still changing on every listing,
  when `halonic tools review notes-mcp` runs in a terminal,
  then it asks nothing, ends on "! 1 tool from notes-mcp stays off because notes-mcp keeps changing it: search. 3 tools are on." and exits 0.
- Given the person answered y for lookup,
  when they press Ctrl C at the next question,
  then lookup stays approved, stderr says "Stopped. Approved 1 tool from notes-mcp before that: lookup." and it exits 130.
- Given `send` approved, and the connector's arguments changed since,
  when the source is reviewed,
  then send is Changed with the line "Its text hasn't changed, but notes-mcp connects differently…" and no before or now.
- Given a description with an escape code, a carriage return and U+202E,
  when the source is reviewed,
  then none of them reaches the terminal raw.
- Given archive's text changed at its server while the person was answering y for it,
  when the source is reviewed again,
  then archive was approved at the fingerprint shown, and is Changed at its new fingerprint rather than on.
- Given the connector's `tools.allow` naming only `lookup`,
  when `halonic tools review notes-mcp` runs in a terminal and the person answers y,
  then it asks only about lookup, shows neither archive, look.up nor search, and the last line is "✓ Approved 1 tool from notes-mcp. 1 tool is on.".
- Given the connector's `tools.allow` naming only `send`, which is approved, as on the agent-with-a-tool page,
  when the source is reviewed,
  then the only line is "✓ Nothing from notes-mcp is waiting for your approval. 1 tool is on." and it exits 0.
