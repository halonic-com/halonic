# cli.commands.tools.approve

- Status: active
- Since: 0.1.0
- Source: HAL-2827 (HAL-850 step 5, C2 Approve all); cli-output 3.10 (revisions 33 and 36, N9); HAL-3004 (`--fingerprint` goes with one tool); HAL-2579 F9

The `halonic tools approve <source> <tool>…` command shall approve each tool named, without a question, in order, one line each with its fingerprint, and stop at the first tool it can't approve with that tool's error: one that changed since the `--fingerprint` given (exit 5, naming the current fingerprint), one Halonic refused (exit 7, with why), or one the source doesn't list (exit 4, with the closest name or the `review` command). A tool approved already shall say so, and a tool its server keeps changing shall be approved like any other when named. With `--all` it shall approve exactly the tools waiting in the listing it read, at the fingerprints it prints, leave out each tool its server keeps changing with the command that approves it by name, and end on "Tools that change later ask again.". Tool names with `--all`, and `--fingerprint` with `--all` or with more than one tool, shall be usage errors (exit 2) that start nothing and approve nothing. With `--json` it shall give the tools approved with their fingerprints and the tools left out. It shall connect the source only in a workspace trusted as it is now, and the three `tools` commands shall share their errors: an unknown connector with the closest id or where to find the connectors, an untrusted workspace (exit 3, nothing started), a refused listing (exit 7), and an approval that can't be read (exit 9), with the `revoke` command that removes it.

## Examples

- Given `archive` waiting,
  when `halonic tools approve notes-mcp archive` runs,
  then it prints "✓ Approved archive from notes-mcp, as it is now." and its fingerprint.
- Given `lookup` and `archive` waiting and `search` changing on every listing,
  when `halonic tools approve notes-mcp --all` runs,
  then lookup and archive are approved, search is left out with "Approve it by name: halonic tools approve notes-mcp search", and the last line is "✓ Approved 2 tools from notes-mcp, as they are now. Tools that change later ask again.".
- Given `--all` approved lookup, and its server then changes it,
  when its tools are listed again,
  then lookup waits as Changed.
- Given `lookup` waiting at another fingerprint than the one given,
  when it is approved with `--fingerprint`,
  then nothing is approved and it exits 5 with the current fingerprint.
- Given `archive`, `lokup` and `lookup` named,
  when they are approved,
  then archive is approved, it stops at lokup with "Couldn't approve lokup: notes-mcp doesn't list a tool called lokup." and lookup isn't tried.
- Given `lookup --all`, `lookup send --fingerprint htl1:0` or `--all --fingerprint htl1:0`,
  when the command runs,
  then it exits 2 and no program starts.
- Given Acme changed since it was trusted,
  when a tool is approved,
  then it stops with exit 3 and no program starts.
- Given a listing of 129 tools,
  when a tool is approved,
  then it stops with "Couldn't use the tool list from notes-mcp: … None of its listed tools are on.", exit 7.
- Given approvals that can't be read,
  when a tool is approved,
  then it names the first tool whose approval can't be read and the `revoke` command that removes it, exit 9.
