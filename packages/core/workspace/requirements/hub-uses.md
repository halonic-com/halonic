# workspace.hub-uses

- Status: active
- Since: 0.1.0
- Source: Nina's config-mistakes check on HAL-14257 (C337 row 11, code row C16), HAL-14270

When `loadWorkspace` has parsed a workspace's files, the workspace package shall report as an error each skill, knowledge, collection and connector a hub's `uses` names that isn't shared at the workspace root, with the code an agent gets for the same item (`unknown-skill`, `unknown-knowledge`, `unknown-collection` or `unknown-connector`), the message `Hub "<hub>" uses unknown <kind> "<name>"`, and the key path and line of the name. An item whose shared file was read but failed its own checks shall not be reported, since that file's own errors are the cause.

## Examples

- Given a hub whose `uses` lists the connector `files` and the skill `plain-words`, and neither is shared at the root, when it is loaded, then it gives `unknown-connector` 'Hub "support" uses unknown connector "files"' and `unknown-skill` 'Hub "support" uses unknown skill "plain-words"', each on the line of its name.
- Given a hub whose `uses` lists the skill `plain`, whose shared `SKILL.md` has no description, when it is loaded, then only the skill file has an error.
