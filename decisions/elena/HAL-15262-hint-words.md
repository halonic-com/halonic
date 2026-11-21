# Decision: allow-address names only the CLI's store, and Take back says why once

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15262 (team wording call on flow check 38's C552 findings 1 and 7, HAL-15218; small wording on approved screens, HAL-2282)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:+VJx9mJIPYypZyKG6LF3kkWVGKDPb7KkyK2eUXTBfM31HdtTmLc3JsA1DYsS6P82zBhEm5iwMf0JVZmWl4x/DQ==

`halonic models allow-address` without a saved key said "Save it with halonic secret set *key* or on
the Models page first." The Models page saves into the keychain, which the CLI never reads
(`docs/security/trust.md`), so the second half sent people to a dead end. The line now ends at
"Save it with halonic secret set *key* first."

Settings › Agent sandbox's saved yes said why twice: the line under the heading ("On Windows, plugin
and integration code can't run in it yet, so it needs your yes.") and then the reason again in
`runnerUnfencedWords`' words for plugins only ("On Windows, plugin code can't run in the sandbox in
this version of Halonic."), which left out integrations. For the reason `windows` the row now shows
"Allowed without the sandbox" and "Allowed on *day*." only. Every other reason keeps its own words
before the day, since the line above says only "on this computer" for those.

## Covers

- cli.commands.models.allow-address
- settings.unfenced-yes-take-back
