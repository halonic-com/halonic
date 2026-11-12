# Decision: a plugin add that can't read its copy back leaves nothing behind

- Approval: Liam asked for this as follow-up 3 of his review of halonic#1744 (HAL-5575), a team decision with no board card; the package owner (Liam) approves this note in review on [HAL-7192](/HAL/issues/HAL-7192)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:arcHs1qywxSudyUXnPOFHc4ggRpDJUcxfwinQpfDCcShLzK5lSCTbQ/cGa2kj/ZS5LvR3p/G+Omby25QGLpUAg==

## What changes

`app.plugin-add` gets one more rule and one more example: when the copy `add` placed can't be read
or checked when it reads it back, and it didn't replace a plugin, it removes the folder and the
install record again and refuses the plugin as broken with its problems. Before, it gave the broken
entry and left the copy in the plugins folder, so `halonic plugin add` said "Couldn't add the
plugin" while the files stayed. No example was removed or weakened.

A replace keeps the copy, as before: the version it replaced is gone already, so there is nothing
to go back to, and the broken entry is what the plugins folder holds.

## Why

A refused add now leaves the plugins folder as it was, whether it was refused before writing or
after, so the message and the files on disk agree. It's in `PluginService`, not the CLI, so
Studio's `plugins.add` gets the same rule.

## Covers

- app.plugin-add
