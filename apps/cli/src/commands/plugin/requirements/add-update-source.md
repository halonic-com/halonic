# cli.commands.plugin.add-update-source

- Status: active
- Since: unreleased
- Source: HAL-16292 (Liam's review of #5144 on HAL-14325); "this copy", C699 row 12 on HAL-16377

When `halonic plugin add <folder or git address> --update` puts a new copy in place of an added plugin that was recorded as added from another folder or git address, the command shall show "! Updating from a different source: <old source> → <new source>. Its settings, secrets and sign-ins carry over to this copy." ahead of the trust check, with each source written as `halonic plugin list` writes it, and shall show no such line when the folder is the same or the git address is the same at another commit.

## Examples

- Given Weather added from `~/sources/weather`, trusted, with a setting saved,
  when `halonic plugin add ~/elsewhere/weather --update` is run with a changed copy and the answer is y,
  then it first says "! Updating from a different source: ~/sources/weather → ~/elsewhere/weather. Its settings, secrets and sign-ins carry over to this copy.", then "✓ Updated Weather 1.2.0. It's on.", and the setting is still saved.
- Given Weather added from `~/sources/weather`,
  when `halonic plugin add ~/sources/weather --update` is run,
  then no "different source" line is shown.
