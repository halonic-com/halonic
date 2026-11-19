# shell.settings-workspace-line

- Status: draft
- Since: unreleased
- Source: flow-settings 3.1 and 4 (HAL-646); HAL-10386; HAL-12859

The shell shall say, under the name of a `workspace` settings section in the Settings dialog and on a phone's section page, whose settings these are: "Part of Acme.", with the open workspace's name. It shall not promise that changes show in Changes or can be undone, because a workspace with history off has neither (HAL-12859). It shall be the same line for every workspace section, so a feature never writes it. A section whose values aren't files in the workspace, as Trust (kept by the app), sets `workspaceLine: false` and then shows no such line. A `display` or `host` section shall not have it.

## Examples

- Given a workspace section with `workspaceLine: false`, such as Trust,
  then no line shows under its name.

- Given Settings opens on Models (workspace) in the workspace Acme,
  then "Part of Acme." shows under "Models".
- Given Settings opens on Assistant (host),
  then no "Part of …" line shows under "Assistant".
- Given the phone opens the page of Models (workspace) in the workspace Acme,
  then the same line shows under the page's name.
