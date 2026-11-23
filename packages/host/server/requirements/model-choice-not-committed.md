# server.model-choice-not-committed

- Status: active
- Since: unreleased
- Source: HAL-16708 (HAL-14808 PR 4a); HAL-16248 (the line that names the files); builds on `server.model-choice-no-trust`, `app.model-choice-not-committed`

When the service's Continue fails with `not-committed`, `POST /api/model-choice/continue` shall answer `{"ok": false, "failed": "not-committed", "keySaved": <boolean>, "files": [...]}`, where `files` keeps only the service's files that are a model choice's own paths (`models.yaml`, `workspace.yaml`, `providers/<id>.yaml` for a first-run provider), in their order, and never the reason. Nothing shall go to the error log for it.

Rationale: the browser's line names the files that hold changes of their own, so it needs them as data. Passing only fixed workspace paths keeps the host's own paths and words on the host, as `server.model-choice-no-trust` keeps the reason there; the refusal is the person's state, not a fault.

## Examples

- Given a Continue that failed with `not-committed` for `models.yaml`, `../acme/home/notes.md` and `providers/anthropic.yaml`, then the answer's `files` are `["models.yaml", "providers/anthropic.yaml"]` and the error log is empty.
