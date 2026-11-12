# Decision: the plugin commands say what cli-output revision 49 says

- Approval: Paperclip task HAL-7536 (Liam's approval of this pull request's wording)
- Kind: user-visible

The board approved revision 49 of the CLI output rules. This pull request brings three plugin
requirements in line with it:

- `halonic plugin add` and `halonic trust --plugin` show the full fingerprint under the trust check
  in a terminal, so it can be passed to `--fingerprint` after a review.
- `halonic plugin remove` names "the API key you entered" only when a key for the plugin is stored
  on this computer, which on the command line it never is. Its refusal text no longer mentions
  secrets for the same reason.

No exit code, flag or file the commands write changes. Only what they print changes.

## Covers

- cli.commands.plugin.add
- cli.commands.plugin.remove
- cli.commands.trust.plugin
