# assistant.build.authoring-tools

- Status: active
- Since: unreleased
- Source: HAL-10 migration checklist U25 (Now; shared with L13); req-assistant revision 6 (HAL-110, HAL-1102); flow-assistant 3.7 (HAL-647); HAL-16790

The Build chat shall offer the model the authoring tools `list_files`, `read_file`, `schema`, `validate`, `propose_file` and `propose_delete`, with `read_file` and `list_files` seeing the workspace as saved, including changes that aren't live yet and changes to review. The `show` tool comes with Show in chat.

## Examples

- Given `hubs/sales/hub.yaml` was edited to rename the hub to "Sales EU", saved, and not yet in a version,
  when the model calls `read_file` on it,
  then it gets the edited text with "Sales EU".
- Given new file `skills/tone/SKILL.md` as a change to review,
  when the model calls `list_files` with `under: "skills"`,
  then the list includes `skills/tone/SKILL.md`.
- Given the model calls `read_file` for a file that doesn't exist,
  then the result is "Error: <path> does not exist".
- Given the model calls `schema` with kind `agent`,
  then the result is the agent file's JSON Schema.
- Given a workspace with 1,002 files,
  when the model calls `list_files` without `under`,
  then the result lists 1,000 paths and ends with "… and 2 more. Pass "under" to list one folder.".
