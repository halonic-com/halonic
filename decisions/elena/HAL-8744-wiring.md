# Decision: createWorkspace adds the missing .env lines to a .gitignore

- Approval: https://paperclip.ing/HAL/issues/HAL-9243
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7W2Jax5nnzdzH+OZY2QkT83OCofkAyihqNw3uPxbnDj7hxOoboERFdQbpm3N3OGR5I5pnhwcmyxBDF32uKh1DA==

`createWorkspace` used to leave an existing `.gitignore` untouched, so a folder whose `.gitignore` didn't list `.env` could end up with secrets that git would track. It now adds the missing `.env` and `.env.*` lines at the end of that file, reports the path as `amended` (new field on `CreatedWorkspace`), and puts the file back if a later write fails. Nothing else in the file changes. The New workspace dialog's note for a non-empty folder says so.

Liam approved this on HAL-9243 (Julian reviewed the code on the pull request).

## Covers

- workspace.create
- workspace.new-workspace-dialog
