# Decision: the plugin backend checks the folder again right before it starts

- Approval: follow-ups from the reviews of halonic-com/halonic#2556 (HAL-8089 slice 4), tracked on HAL-8900. Liam approves this note in review of this PR.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:0i9Hn6XikYZTGl/TETuXBDkZeS+XJkQfW4Wj275pjiTbFMASHnzXR5KJJj5XcuRkudqGCykwlFiLCcynycqAAA==
- Task: HAL-8900

## What changes

- `cli.open-plugin-backend`: right before the runner starts, the CLI checks the folder against the files the person trusted and refuses the start on any difference. The check and the load are still two steps, so a small gap remains; the full fix (the runner loads from a copy it has hashed) is noted on HAL-8089.
- When a restart is refused because the files differ from the first read, the message says "start the run again" instead of "trust it again".
- The trust store is built from the same profile environment as the plugins folder.

## Why

Julian's security review (HAL-8898) and Liam's code review found a window between the trust check and the load. This shrinks it without changing what a person trusts or sees.

## Covers

- cli.open-plugin-backend
