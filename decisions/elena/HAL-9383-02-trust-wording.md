# Decision: the trust check says Programs and keeps "unless you change that"

- Approval: the wording is Sofia's microcopy revisions 97 to 99 (board-approved T7, T8, T13) and her answers on HAL-9383; Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:hE6rrT46J2hXX9bymiFPCB21Oq6edo6vBn1KnwqJQqgyb7OkacfqpQVTFtHEhjcur5XPFkMSf3YTIZMDDt+pAA==
- Task: HAL-9383

## What changes

`plugins.plugin-trust-check`, `app.plugin-trust-sections` and `cli.commands.plugin.add` name the section "Programs" instead of "Programs on this computer", and the tools line reads "Each one asks a person first unless you change that." Tests changed only in the expected words.

## Why

T7 (board-approved, revision 81) says Programs (n), T8 says "unless you change that", and the workspace check already uses them. The CLI shares the heading from core.

## Covers

- plugins.plugin-trust-check
- app.plugin-trust-sections
- cli.commands.plugin.add
