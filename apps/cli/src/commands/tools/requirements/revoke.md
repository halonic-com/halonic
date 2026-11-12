# cli.commands.tools.revoke

- Status: active
- Since: 0.1.0
- Source: HAL-2827 (HAL-850 step 5); cli-output 3.10 (revision 33)

The `halonic tools revoke <source> <tool>…` command shall remove the approval of each tool named, in order, one line each, an approval that can't be read included, so the tool is Not approved again. It shall check every name first: when one of them isn't approved, it shall remove none and stop with that tool's error, exit 4. It reads only the approvals, so it shall start no connector. With `--json` it shall give the tools whose approval it removed.

## Examples

- Given `send` approved,
  when `halonic tools revoke notes-mcp send` runs,
  then it prints "✓ Removed your approval for send from notes-mcp. It's off until you approve it again." and send has no approval, so it is Not approved again.
- Given the approval of `send` damaged, so it can't be read,
  when its approval is revoked,
  then it is removed and the command exits 0.
- Given `archive` not approved,
  when its approval is revoked,
  then it stops with "Couldn't remove the approval for archive: it isn't approved in notes-mcp.", exit 4.
- Given `send` approved and `archive` not approved,
  when `halonic tools revoke notes-mcp send archive` runs,
  then it stops with the error for archive, exit 4, and send is still approved.
