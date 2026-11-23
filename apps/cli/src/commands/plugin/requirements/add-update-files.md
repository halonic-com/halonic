# cli.commands.plugin.add-update-files

- Status: active
- Since: unreleased
- Source: HAL-16319 (C696 finding 4 on HAL-16316)

When `halonic plugin add <folder or git address> --update` puts a new copy in place of an added plugin and the new copy's files differ from the files the replaced copy's install record holds, the command shall show, ahead of the trust check and marked with !, "Files changed since the copy it replaces: " and the paths, grouped as "changed", "new" and "removed", in that order, the groups separated by "; ", at most 10 paths in all, then "and <n> more" when more changed. When the files are the same, it shall show no such line.

## Examples

- Given Weather added from `./weather` and trusted,
  when `backend/index.js` is edited, `backend/extra.js` added, and `halonic plugin add ./weather --update` is run,
  then ahead of the check it says "! Files changed since the copy it replaces: changed backend/index.js; new backend/extra.js."
- Given Weather added and `./weather` unchanged,
  when `halonic plugin add ./weather --update` is run,
  then no "Files changed" line is shown.
