# app.assistant-untrusted-items-only

- Status: active
- Since: 0.1.0
- Source: HAL-65 section F, `workspace.trust.assistant-untrusted-items-only` (rule B, HAL-3268) and `workspace.trust.untrusted-changes-held` (rule C); agreed on HAL-3362; HAL-3947

While the workspace is untrusted, the review service shall write only Halonic item files: a file that `placeOf` gives a kind for in the grouped layout (agents, workflows, routines, library items, `workspace.yaml`, `models.yaml`). It shall refuse any other path as untrusted and touch neither the file nor its record. It shall ask whether the workspace is trusted on every write. A file it writes while untrusted shall have its record marked as written untrusted, and the mark shall stay through later writes until the record goes. The `propose_file` and `propose_delete` tools give the model "Not trusted yet: only Halonic items can be changed." for this refusal.

## Examples

- Given an untrusted workspace,
  when the assistant writes `.envrc`, `package.json` or `.vscode/tasks.json`,
  then it is refused as untrusted and nothing is written.
- Given an untrusted workspace,
  when the assistant writes `agents/clerk.agent.yaml` or `models.yaml`,
  then it is written and its record is marked as written untrusted.
- Given a trusted workspace and a first write that succeeds,
  when the workspace stops being trusted and the assistant writes `package.json`,
  then the second write is refused.
- Given a record marked as written untrusted,
  when the assistant writes the file again while trusted,
  then the record keeps the mark.
