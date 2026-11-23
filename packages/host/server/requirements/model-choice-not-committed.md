# server.model-choice-not-committed

- Status: active
- Since: unreleased
- Source: HAL-16708 (HAL-14808 PR 4a, Liam's D3); HAL-16248 (the line that names the files)

When the service's `continue` fails at the `not-committed` step, `POST /api/model-choice/continue` shall answer `{"ok": false, "failed": "not-committed", "keySaved": <boolean>, "files": […]}`, where `files` holds each path the service named that is `models.yaml`, `workspace.yaml` or `providers/<name>.yaml`, and leaves out any other. The reason shall not be in the answer, and shall not go to the error log.

Rationale: the screen names the files that hold someone's own uncommitted edits ("Couldn't save: models.yaml has changes that aren't committed. …"), so the browser needs their names. Only the choice files' own workspace paths pass, so a host's path never reaches the browser. The refusal is the person's to fix, not a fault, so the log stays quiet.

## Examples

- Given the service names `models.yaml`, `providers/anthropic.yaml` and `/acme/home/workspace/notes.md`, then the answer's `files` is `["models.yaml", "providers/anthropic.yaml"]`.
