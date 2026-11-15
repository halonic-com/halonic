# shell.settings-workspace-line

- Status: draft
- Since: 0.1.0
- Source: flow-settings 3.1 and 4 (HAL-646); HAL-10386

The shell shall say, under the name of a `workspace` settings section in the Settings dialog and on a phone's section page, whose settings these are and where changes show: "Part of Acme. Changes here show in Changes and can be undone.", with the open workspace's name. It shall be the same line for every workspace section, so a feature never writes it. A `display` or `host` section shall not have it.

## Examples

- Given Settings opens on Models (workspace) in the workspace Acme,
  then "Part of Acme. Changes here show in Changes and can be undone." shows under "Models".
- Given Settings opens on Assistant (host),
  then no "Part of …" line shows under "Assistant".
- Given the phone opens the page of Models (workspace) in the workspace Acme,
  then the same line shows under the page's name.
