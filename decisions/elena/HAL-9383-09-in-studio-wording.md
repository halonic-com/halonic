# Decision: the In Studio line in the trust check is in plain words

- Approval: Sofia's wording check on HAL-9383, a small wording change on an approved dialog that the team decides; Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:rJgNl23t94sHCLKgNxkPfgjrhgeKhZt5xxTLPgdkRI0kVZ3EGED1osLEUmiGDchRR7dvU26j71O2Oa0nGJaJDw==
- Task: HAL-9383

## What changes

`plugins.plugin-trust-check`: the first line under In Studio said "Text from the plugin never becomes page code; at most it shows basic formatting and web links, each with its address." It now says "A plugin's text can show basic formatting (bold, lists, quotes, code) and links with their addresses, and nothing else." after "Halonic draws these itself."

## Why

"Page code" is developer talk in a dialog a plain user reads. The new line says the same thing (formatting and links only, each link with its address) in Sofia's words.

## Covers

- plugins.plugin-trust-check
