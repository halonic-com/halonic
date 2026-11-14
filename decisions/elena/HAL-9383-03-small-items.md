# Decision: a plugin's list row quotes its description

- Approval: the wording is Sofia's microcopy revisions 97 to 99 (board-approved T7, T8, T13) and her answers on HAL-9383; Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:nf1jw8ISKBiYlsyzd7sOPoqv+UYRj/hZc/nzpJ7WBDobdZMi/VkgOw7cmuovLuFm7BbgX+np0xDBZspKnm5NAQ==
- Task: HAL-9383

## What changes

`plugins.plugin-list` says the row shows the description in quotes, and its example shows the quotes. A failed setting or secret save now offers **Try again** (not for a value the host refused), so `plugins.plugin-settings` says so and gains an example. The other B29 items change no requirement.

## Why

A plugin's description is the plugin's own text, so Studio quotes it everywhere else (T7, the page).

## Covers

- plugins.plugin-list
- plugins.plugin-settings
