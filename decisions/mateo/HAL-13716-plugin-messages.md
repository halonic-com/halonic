# Decision: plugin add and tools messages point the right way

- Task: HAL-13716
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13716 (small wording on approved CLI flows, team decision under the HAL-2282 rule, reviewed by Liam on the task)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1Xheb8U942EXrDEZgrMb2qP22U8Lj2ItpGucu3FUfAfDQqBvduZizePy3Z3cUQ0YQ3Pe1fEFPcQEg3j9vXa8BQ==

## What changes

- `plugin add` with a commit id cut short, such as `ec4e2ae`, says to use the full commit id (40
  characters), a branch or a tag, not git's own text.
- git's short form `user@host:path` is refused with the `ssh://user@host/path` address to write
  instead. It is not rewritten silently: on some hosts git reads that path from the user's home
  folder, so a rewrite could fetch another repository.
- An `https://` address with a password and no path is refused because it has a password in it,
  not because of its scheme.
- When the git found drops Halonic's git settings (a wrapper, a shim or git older than 2.31),
  `plugin add` ends with `unavailable` (exit 9) and `halonic run`'s fix "Put git 2.31 or later
  itself first on your PATH", the same as `halonic run` (HAL-12342). This is the one exit-code
  change; it was exit 2 with "Check the folder or git address."
- A folder that doesn't exist reads "there's no folder ./nope".
- A manifest error starts with the field's place, such as `backend.tools[0].risk:` or `id:`.
- `tools review` or `tools approve` on a plugin's connector whose plugin isn't added gets a second
  line that names `halonic plugin add`. It still exits 0 and `--json` is unchanged.

The requirements `cli.commands.plugin.add`, `cli.commands.plugin.add-git`,
`cli.commands.tools.plugin-connector` and `git.export` gain these cases. No test was weakened or
skipped.

## Why

The real-run QA pass on HAL-13712 found each of these messages pointing the wrong way while the
behaviour was right.

## Covers

- cli.commands.plugin.add
- cli.commands.plugin.add-git
- cli.commands.tools.plugin-connector
- git.export
