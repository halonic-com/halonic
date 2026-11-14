# Decision: the Remove dialog names the connectors that stop working

- Approval: the wording is Sofia's microcopy revisions 97 to 99 (board-approved T7, T8, T13) and her answers on HAL-9383; Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZFClIZkr83z+Yy4KOTtY3sA/5S2DPjVtH1CXBw0AtZ2LdoZZ3hoXgNcbaGTtB602JHR/WRUPV0PI9awNQnpgCQ==
- Task: HAL-9383

## What changes

`plugins.plugin-actions` gains the connector sentence of microcopy T13 and the sentence for when Halonic can't tell which connectors use the plugin, with one new example. While Halonic checks which connectors use the plugin, the dialog shows the line "Checking which connectors use it…" and **Remove plugin** stays unavailable, so Remove waits for the check. Nothing was removed or weakened.

## Why

T13 says a connector that uses the plugin stops working when it is removed. The dialog left the sentence out, so a removal could break a connector without a word.

## Covers

- plugins.plugin-actions
