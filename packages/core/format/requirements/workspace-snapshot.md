# format.workspace-snapshot

- Status: active
- Since: unreleased
- Source: HAL-17948 (plan HAL-17450 rev 5, "How the plugin reads the workspace" and "Safety")

The format shall define the workspace snapshot as plain, engine-neutral data: `format` (1), `workspace` with its `name` (1 to 80 characters, no hidden marks) and `commit` (a full lowercase SHA-1 or SHA-256 id), and `tools`, at most 200 tool files in the `format.tool-file` shape with every default filled in, and no other key at any depth. When `makeSnapshot` is given a workspace's name, commit and parsed tools, it shall sort the tools by name and check the result as `readSnapshot` does. When `readSnapshot` reads a snapshot, it shall return it whole or refuse it whole, with every problem: the schema's, `value-looks-like-key` at `workspace.name` when the name holds a key by the rules of `format.keys-in-values`, each tool's `format.tool-refusals` at `tools[i]`, `tool-name-twice` or `tool-id-twice` where a name or id is used again, and `tools-not-sorted` at the first tool out of name order. `snapshotText` shall write a snapshot as canonical JSON, so the same tools in any order give the same text. The snapshot's JSON Schema shall equal the committed `spec/workspace-snapshot.schema.json`.

## Examples

- Given the tools `task_get` and `my_prs`, when the snapshot is made, then they are listed `my_prs` first, and reading its text back gives the same snapshot.
- Given the same tools in two orders, when both snapshots are written, then the texts are equal.
- Given `format: 2`, a `signals` key, a seven-digit commit or a tool whose action is `shell.run`, when it is read, then it is refused there.
- Given a tool with a `token` parameter and another with a key in its description, when the snapshot is read, then it is refused with `parameter-asks-for-key` at `tools[0].parameters.token` and `value-looks-like-key` at `tools[1].description`.
- Given a workspace name holding an Anthropic key, when the snapshot is read, then it is refused with `value-looks-like-key` at `workspace.name`.
- Given two tools named `my_prs`, two with the same id or `b_two` before `a_one`, when it is read, then it is refused with `tool-name-twice`, `tool-id-twice` or `tools-not-sorted` at the second tool.
- Given 201 tools, when it is read, then it is refused at `tools`.
