# Decision: register the workspace template as a file kind, with a read-only action

- Approval: the task HAL-18141 asks for templates in the snapshot (PR 2 of the split Liam approved on HAL-17956, plan HAL-17450 rev 5); it adds an action, so Liam signs this note in review
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:JXv96qRqaPte7UBmrEUHsGBQjbb/xZYwbTsnyr7Mz4FNekoM/cPGKCHasBR0TAndZaoFwyBvY4nczAWgP9ZRCw==

The file kind registry gets one new kind, `template` (`library/templates/<id>.md` at the workspace root), so the loader, `halonic validate` and the plugin builder read templates like any other workspace file. A template is Markdown with optional front matter (`title`); its file name is its id, and a key in it is refused. The snapshot gets an optional `templates` list, left out when a workspace has none, so existing snapshots keep their bytes. The format gets one new action, `paperclip.template`, which needs no key and no capability and only reads the served snapshot's templates: it can't change anything. `halonic schema` writes one more file, `template.schema.json`, so its golden output says 18 schemas. Studio's Changes list names a template "Template" with the Library icon, as it does a tool. The misplaced-file warning no longer treats a bare `<id>.md` name as a kind's, so a README stays quiet as before.

## Covers

- format.kind-registry
- format.template-file
- format.tool-actions
- format.workspace-snapshot
- format.spec-id-version
- workspace.snapshot-input
- runtime.template-action
- apps/cli/src/commands/schema/golden/schema-output.json
- packages/studio/features/source-control/src/changes-words.ts
- packages/core/format/spec/template.schema.json
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
