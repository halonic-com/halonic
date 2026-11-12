# Decision: the plugin commands say what cli-output revision 49 says

- Approval: the board approved the wording as cli-output revision 49; Liam approved this pull
  request's wording on HAL-7536 and signs this note on HAL-7706. Internal until a user key is
  pinned (HAL-3434, docs/guides/checks.md)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pyakqjDSX8pib9E5eL5mfOrlVPnrYb526jnVFqjDnCnwaxR81WgtBOmmg3ShGCcEbrl90vOGjvOKYHjzCSA1DQ==

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
