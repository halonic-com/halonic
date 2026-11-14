# app.new-library-item

- Status: active
- Since: 0.1.0
- Source: HAL-1303, P3; flow-library 3.2 and 3.3, `library.connectors.new-mcp-asks` (HAL-64), HAL-119 (U38)

When the Library or the assistant asks for a new skill, collection or connector, `newLibraryFile` shall return the path and text of its file and write nothing. The id comes from the name (`shell.items.id-from-name`), with `-2`, `-3` when another item of that kind in the same place has it. A skill lives in `library/skills/<id>/SKILL.md` and a connector in `library/connectors/<id>.connector.yaml`, in the hub's folder or at the workspace root; a collection lives in `library/collections/<id>.collection.yaml` at the root. A new collection has one required text field `name`. A new HTTP or local program connector shall have `tools.approve: all`, so every tool it offers asks a person first; a new Google connector shall have `tools.approve` name the tools that change or send something (the caller gives them, since Google's tool names aren't in this package yet), so reading and searching don't ask. A connector's secret is only its name: the bearer token of an HTTP connector, or a variable of the same name in the `secretEnv` of a local program; a Google connector has none. If the name is empty, a skill has no description, or a connector has no account, URL or command, then it shall return an error and make no file.

## Examples

- Given a workspace with a collection `claims`,
  when a collection "Claims" is asked for,
  then the file is `library/collections/claims-2.collection.yaml`.
- Given a hub `acme`,
  when a skill "Acme refunds" with the description "Use for refund questions" is asked for in it,
  then the file is `hubs/acme/library/skills/acme-refunds/SKILL.md` with that name and description in its header.
- Given an HTTP connector "Notes" with the secret `NOTES_TOKEN`,
  then the file has `secret: NOTES_TOKEN` and `tools: { approve: all }`.
- Given a Google connector with `askFirst` `[gmail_send]`,
  then the file has `approve: [gmail_send]`, not `all`.
- Given a local program connector "Notes" with the command `npx -y @acme/notes-mcp` and the secret `NOTES_TOKEN`,
  then the file has `secretEnv: { NOTES_TOKEN: NOTES_TOKEN }`.
- Given a skill with no description, then the error is `description_missing` and nothing is made.
