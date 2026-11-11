# Decision: a working folder may not go through a dot-folder at any depth

- Approval: the maintainer approves this change in review of HAL-5951
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:knuXj55/t8TAgb72HtbnUfXtD1O2uUbB6EVYAcPh1EFuOa/XWzaiVFvjS2oR1ggZIKp7aFXY535VZjelxiPgBw==

The requirement grows stricter; nothing it refused before is now accepted, and no test was weakened.

- `format.agent-sandbox-fields` refused a working folder whose first part starts with `.`, but
  not a deeper one. `vendor/lib/.git/hooks`, where `vendor/lib` is a nested clone with its own
  `.git` folder, passed, and so did the real-place check in the harness profile builder, which
  runs the same function on the resolved path. The agent could then write hooks or a
  `core.fsmonitor` setting that git runs outside the sandbox the next time someone uses git in
  that clone. The same goes for a nested `.claude`, `.codex` or `.vscode` folder.
- A working folder now fails when any of its parts starts with `.`, compared after folding, so
  `.GIT` and `．git` fail too. The message names the path up to the dot-folder.
- `files/.notes` and `files/.gitkeep-dir`, accepted until now, are refused. They move from the
  accepted list to the refused list, and the requirement example that said `files/.notes` passes
  now says it fails. Eight refused cases and one message test are added.

## Covers

- format.agent-sandbox-fields
